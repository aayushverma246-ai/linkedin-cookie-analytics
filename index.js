/**
 * LinkedIn Voyager Analytics for n8n
 * 
 * A lightweight utility to fetch authenticated user profile data, recent posts,
 * and calculate detailed engagement metrics using LinkedIn Voyager API and session cookies.
 * 
 * @repository linkedin-voyager-analytics
 * @license MIT
 */

/**
 * Validates the presence and format of required LinkedIn Voyager session cookies.
 * 
 * @param {string} liAt - The 'li_at' session cookie value.
 * @param {string} jsessionid - The 'JSESSIONID' CSRF token/session cookie.
 * @throws {Error} If any cookie is missing or invalid.
 */
function validateCookies(liAt, jsessionid) {
  if (!liAt || typeof liAt !== 'string' || liAt.trim() === '') {
    throw new Error("Missing credentials: 'li_at' cookie is required.");
  }
  if (!jsessionid || typeof jsessionid !== 'string' || jsessionid.trim() === '') {
    throw new Error("Missing credentials: 'JSESSIONID' cookie/CSRF token is required.");
  }
  
  // Basic validation for common placeholders
  if (liAt.includes('YOUR_') || jsessionid.includes('YOUR_')) {
    throw new Error("Invalid credentials: Please replace placeholders with your actual LinkedIn session cookies.");
  }
}

/**
 * Generates the standardized headers required by the LinkedIn Voyager API.
 * 
 * @param {string} liAt - The 'li_at' session cookie.
 * @param {string} jsessionid - The 'JSESSIONID' session cookie.
 * @returns {Object} Request headers.
 */
function getHeaders(liAt, jsessionid) {
  // Strip optional wrapping quotes from JSESSIONID if present to prevent parsing bugs
  const cleanJsessionid = jsessionid.replace(/^"|"$/g, '');
  
  return {
    'csrf-token': cleanJsessionid,
    'cookie': `JSESSIONID="${cleanJsessionid}"; li_at=${liAt}`,
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'accept': 'application/vnd.linkedin.normalized+json+2.1',
    'x-restli-protocol-version': '2.0.0',
    'x-li-track': JSON.stringify({ clientVersion: '1.13.21', osName: 'web', deviceFormFactor: 'DESKTOP', mpName: 'voyager-web' }),
  };
}

/**
 * Fetches the authenticated user's profile and extracts URN pointers.
 * 
 * @param {Function} httpRequest - The n8n HTTP request helper (this.helpers.httpRequest).
 * @param {Object} headers - Ready-to-use request headers.
 * @returns {Promise<Object>} The profile summary details along with internal URN pointers.
 * @throws {Error} If network, authorization, or schema verification fails.
 */
async function getProfile(httpRequest, headers) {
  let profileResponse;
  try {
    profileResponse = await httpRequest({
      method: 'GET',
      url: 'https://www.linkedin.com/voyager/api/me',
      headers,
    });
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Authentication failed: The provided session cookies are invalid or expired.');
    }
    if (error.response?.status === 429) {
      throw new Error('Rate limited: Too many requests. LinkedIn has throttled the current IP/session.');
    }
    throw new Error(`Profile fetch failed: ${error.message}`);
  }

  const data = profileResponse?.data;
  if (!data) {
    throw new Error('Profile fetch failed: Received empty response body from LinkedIn Voyager API.');
  }

  const miniProfileUrn = data['*miniProfile'];
  if (!miniProfileUrn) {
    throw new Error('Voyager response changed: No miniProfile reference (*miniProfile) found in profile payload.');
  }

  const included = profileResponse.included || [];
  const miniProfile = included.find(item => item.entityUrn === miniProfileUrn);
  if (!miniProfile) {
    throw new Error(`Unexpected schema: No included entity matched miniProfile URN: ${miniProfileUrn}`);
  }

  const dashUrn = miniProfile.dashEntityUrn;
  if (!dashUrn) {
    throw new Error('Unexpected schema: Resolved miniProfile has no dashEntityUrn. Cannot retrieve posts.');
  }

  return {
    fullName: `${miniProfile.firstName || ''} ${miniProfile.lastName || ''}`.trim(),
    occupation: miniProfile.occupation || null,
    publicIdentifier: miniProfile.publicIdentifier || null,
    profileUrl: miniProfile.publicIdentifier ? `https://www.linkedin.com/in/${miniProfile.publicIdentifier}` : null,
    dashUrn,
  };
}

/**
 * Fetches recent posts (up to 20) for the authenticated user.
 * 
 * @param {Function} httpRequest - The n8n HTTP request helper (this.helpers.httpRequest).
 * @param {Object} headers - Ready-to-use request headers.
 * @param {string} dashUrn - The Member's Dash URN required by Voyager GraphQL.
 * @returns {Promise<Object>} Raw JSON response containing elements, updates, and counts.
 * @throws {Error} If the API request encounters error.
 */
async function getPosts(httpRequest, headers, dashUrn) {
  try {
    const postsResponse = await httpRequest({
      method: 'GET',
      url: `https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true&variables=(count:20,start:0,profileUrn:${encodeURIComponent(dashUrn)})&queryId=voyagerFeedDashProfileUpdates.4af00b28d60ed0f1488018948daad822`,
      headers,
    });
    return postsResponse;
  } catch (error) {
    throw new Error(`Posts fetch failed: ${error.message}`);
  }
}

/**
 * Parses and indexes LinkedIn updates and their associated social counts.
 * 
 * @param {Object} postsResponse - Raw API response data from LinkedIn Voyager.
 * @returns {Array<Object>} Extracted raw post records.
 */
function buildPostRecords(postsResponse) {
  if (!postsResponse || !postsResponse.included) {
    return [];
  }

  const included = postsResponse.included;

  // Index SocialActivityCounts by activity URN
  const countsByActivity = {};
  for (const item of included) {
    if (item.$type === 'com.linkedin.voyager.dash.feed.SocialActivityCounts' && item.urn) {
      countsByActivity[item.urn] = item;
    }
  }

  // Index Update objects by their backend activity URN
  const updatesByActivity = {};
  for (const item of included) {
    if (item.$type === 'com.linkedin.voyager.dash.feed.Update' && item.metadata?.backendUrn) {
      updatesByActivity[item.metadata.backendUrn] = item;
    }
  }

  // Extract ordered activity URNs from the feed element pointers
  const elementUrns = postsResponse.data?.data?.feedDashProfileUpdatesByMemberShareFeed?.['*elements'] || [];
  const activityUrns = [...new Set(
    elementUrns
      .map(u => u.match(/urn:li:activity:\d+/))
      .filter(Boolean)
      .map(m => m[0])
  )];

  return activityUrns.map(activityUrn => {
    const update = updatesByActivity[activityUrn];
    const counts = countsByActivity[activityUrn];

    const numLikes = counts?.numLikes ?? 0;
    const numComments = counts?.numComments ?? 0;
    const numShares = counts?.numShares ?? 0;
    const numImpressions = counts?.numImpressions ?? 0;
    const engagementScore = numLikes + numComments + numShares;

    return {
      activityUrn,
      text: update?.commentary?.text?.text ?? null,
      postUrl: update?.socialContent?.shareUrl ?? null,
      postedRelative: update?.actor?.subDescription?.text?.replace('•', '').trim() ?? null,
      numLikes,
      numComments,
      numShares,
      numImpressions,
      engagementScore,
      engagementRate: numImpressions > 0 ? +(engagementScore / numImpressions * 100).toFixed(2) : 0,
      reactionBreakdown: counts?.reactionTypeCounts ?? [],
      missingUpdateObject: !update,
    };
  });
}

/**
 * Sorts post records in-place by engagement metrics and registers a performance rank.
 * 
 * @param {Array<Object>} postRecords - Array of computed post objects.
 * @returns {Array<Object>} Ranked post records.
 */
function rankPosts(postRecords) {
  postRecords.sort((a, b) => {
    // Primary sort: Descending engagement score (Likes + Comments + Shares)
    if (b.engagementScore !== a.engagementScore) {
      return b.engagementScore - a.engagementScore;
    }
    // Secondary sort: Descending engagement rate (impressions performance)
    return b.engagementRate - a.engagementRate;
  });

  postRecords.forEach((post, index) => {
    post.rank = index + 1;
  });

  return postRecords;
}

/**
 * Calculates aggregate, average, and peak analytics metrics across all posts.
 * 
 * @param {Array<Object>} postRecords - Array of ranked post records.
 * @returns {Object} Complete summary metrics including highest and lowest performing posts.
 */
function calculateSummary(postRecords) {
  const postsFound = postRecords.length;

  if (postsFound === 0) {
    return {
      postsFound: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      totalImpressions: 0,
      averageLikes: 0,
      averageComments: 0,
      averageShares: 0,
      averageImpressions: 0,
      averageEngagementRate: 0,
      highestEngagementPost: null,
      highestViewedPost: null,
      lowestPerformingPost: null,
    };
  }

  let totalLikes = 0;
  let totalComments = 0;
  let totalShares = 0;
  let totalImpressions = 0;
  let sumEngagementRate = 0;

  let highestEngagementPost = postRecords[0];
  let highestViewedPost = postRecords[0];
  let lowestPerformingPost = postRecords[0];

  for (const post of postRecords) {
    totalLikes += post.numLikes;
    totalComments += post.numComments;
    totalShares += post.numShares;
    totalImpressions += post.numImpressions;
    sumEngagementRate += post.engagementRate;

    // Highest engagement: compare score, tie-break with rate
    const isHigherEngagement = 
      post.engagementScore > highestEngagementPost.engagementScore ||
      (post.engagementScore === highestEngagementPost.engagementScore && post.engagementRate > highestEngagementPost.engagementRate);
      
    if (isHigherEngagement) {
      highestEngagementPost = post;
    }

    // Highest impressions (Views)
    if (post.numImpressions > highestViewedPost.numImpressions) {
      highestViewedPost = post;
    }

    // Lowest performing: compare score, tie-break with rate
    const isLowerPerformance = 
      post.engagementScore < lowestPerformingPost.engagementScore ||
      (post.engagementScore === lowestPerformingPost.engagementScore && post.engagementRate < lowestPerformingPost.engagementRate);
      
    if (isLowerPerformance) {
      lowestPerformingPost = post;
    }
  }

  return {
    postsFound,
    totalLikes,
    totalComments,
    totalShares,
    totalImpressions,
    averageLikes: +(totalLikes / postsFound).toFixed(2),
    averageComments: +(totalComments / postsFound).toFixed(2),
    averageShares: +(totalShares / postsFound).toFixed(2),
    averageImpressions: +(totalImpressions / postsFound).toFixed(2),
    averageEngagementRate: +(sumEngagementRate / postsFound).toFixed(2),
    highestEngagementPost,
    highestViewedPost,
    lowestPerformingPost,
  };
}

/**
 * Builds the complete structured analytics profile and post analysis.
 * 
 * @param {Object} postsResponse - Raw feed responses from LinkedIn.
 * @returns {Object} Structured data containing the post array and compiled summary metrics.
 */
function buildAnalytics(postsResponse) {
  const records = buildPostRecords(postsResponse);
  const rankedRecords = rankPosts(records);
  const summary = calculateSummary(rankedRecords);

  return {
    summary,
    posts: rankedRecords,
  };
}

/**
 * Orchestrates the full process from credential validation through profile
 * fetching, post fetching, data indexing, ranking, and analytics compile.
 * 
 * @param {Function} httpRequest - The n8n HTTP Client helper.
 * @param {string} liAt - LinkedIn session cookie `li_at`.
 * @param {string} jsessionid - LinkedIn session cookie `JSESSIONID`.
 * @returns {Promise<Object>} Standard output payload.
 */
async function runVoyagerAnalytics(httpRequest, liAt, jsessionid) {
  validateCookies(liAt, jsessionid);
  const headers = getHeaders(liAt, jsessionid);

  // 1. Fetch profile and resolve dashEntityUrn
  const profileInfo = await getProfile(httpRequest, headers);
  const { dashUrn, ...profileSummary } = profileInfo;

  // 2. Fetch recent posts
  const postsResponse = await getPosts(httpRequest, headers, dashUrn);

  // 3. Process data & compute analytics
  const { summary, posts } = buildAnalytics(postsResponse);

  return {
    success: true,
    profile: profileSummary,
    analytics: summary,
    posts,
  };
}

// ==========================================
// n8n Code Node Entrypoint Execution
// ==========================================

// Check if running within n8n environment context
if (typeof this !== 'undefined' && this && this.helpers) {
  // Attempt to resolve input cookies from the incoming n8n node input payload
  const inputItem = typeof $input !== 'undefined' ? $input.first()?.json : {};

  // Fallback inputs: Reads from variables or from $input.
  const liAt = inputItem?.li_at || inputItem?.liAt || '';
  const jsessionid = inputItem?.JSESSIONID || inputItem?.jsessionid || '';

  // Execute and return wrapped inside the array format expected by n8n Code Nodes
  try {
    const result = await runVoyagerAnalytics(this.helpers.httpRequest, liAt, jsessionid);
    return [{ json: result }];
  } catch (error) {
    // Bubbles error to n8n UI with descriptive messages
    throw new Error(`LinkedIn Voyager Analytics Error: ${error.message}`);
  }
} else {
  // Export functions if running inside standard Node.js (e.g. for local testing/linting)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      validateCookies,
      getHeaders,
      getProfile,
      getPosts,
      buildPostRecords,
      rankPosts,
      calculateSummary,
      buildAnalytics,
      runVoyagerAnalytics
    };
  }
}
