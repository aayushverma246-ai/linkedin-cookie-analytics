# LinkedIn Cookie Analytics for n8n

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![JavaScript](https://img.shields.io/badge/language-JavaScript-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![n8n Compatible](https://img.shields.io/badge/n8n-Compatible-orange.svg)](https://n8n.io/)
[![GitHub Stars](https://img.shields.io/badge/GitHub-Stars-blue.svg)](#)

A lightweight, high-performance JavaScript utility for **n8n** that retrieves the currently authenticated LinkedIn user's profile, recent posts, and computes detailed engagement analytics using only session cookies.

> [!NOTE]
> This project utilizes LinkedIn's internal Voyager API. It is designed **exclusively** for fetching analytics for the authenticated user account and **cannot** be used to scrape arbitrary LinkedIn profiles.

---

## Features

- **✅ Fetch Authenticated Profile**: Retrieves name, occupation, public identifier, and profile URL.
- **✅ Retrieve Recent Posts**: Queries the user's latest updates (up to 20 recent posts).
- **✅ Compute Engagement Analytics**: Aggregates likes, comments, shares, and impressions.
- **✅ Rank Posts by Engagement**: Orders posts by engagement score, using engagement rate as a tie-breaker.
- **✅ Cookie-Based Authentication**: Operates entirely with active browser cookies; no password needed.
- **✅ No Browser Automation**: Lightweight, fast, and does not require Puppeteer, Playwright, or Selenium.
- **✅ Lightweight**: No external npm dependencies required inside n8n.
- **✅ Works in n8n**: Standardized Code Node format ready to copy-paste or import.

---

## How It Works

LinkedIn uses an internal API system known as **Voyager**. By capturing your active session cookies (`li_at` and `JSESSIONID`), this utility mimics a desktop browser request to:
1. Query the `/voyager/api/me` endpoint to identify the user URN and resolve the `miniProfile` entity.
2. Query the Voyager GraphQL engine `/voyager/api/graphql` using the resolved member URN to retrieve recent updates.
3. Parse and index `SocialActivityCounts` and `Update` records to match interaction data with post contents.
4. Calculate engagement statistics and rank posts.

---

## Setup & Installation

### 1. Retrieve LinkedIn Cookies

To authenticate the request, you must extract two cookies from an active LinkedIn browser session:

1. Open LinkedIn in your browser and log in.
2. Open the browser's developer tools (F12 or Right Click -> **Inspect**).
3. Navigate to the **Application** (Chrome/Edge) or **Storage** (Firefox) tab.
4. Under **Storage** -> **Cookies**, select `https://www.linkedin.com`.
5. Find and copy the values for:
   - **`li_at`**: The session token.
   - **`JSESSIONID`**: The CSRF token (usually starts with `ajax:`).

> [!WARNING]
> Keep your cookies secure. Anyone who has access to your `li_at` cookie can access your LinkedIn account. Never commit cookies to Git or public repositories.

### 2. Import to n8n

You can import the pre-configured workflow:

1. Copy the contents of [workflow.json](workflow.json).
2. Open your n8n workspace, create a new workflow, and paste the JSON (Ctrl+V / Cmd+V) directly onto the canvas.
3. Open the **Define Credentials** node and replace `YOUR_LI_AT_COOKIE_HERE` and `YOUR_JSESSIONID_HERE` with your extracted cookie values.
4. Click **Execute Workflow**.

---

## Input / Output Specs

### Input Format

The script expects the input node to provide the cookies as JSON fields:

```json
{
  "li_at": "AQEDAWER...",
  "JSESSIONID": "ajax:1385..."
}
```

### Output Format

Returns a single object structured as follows:

```json
{
  "success": true,
  "profile": {
    "fullName": "Jane Doe",
    "occupation": "Senior Developer Advocate at TechCorp",
    "publicIdentifier": "jane-doe-advocate",
    "profileUrl": "https://www.linkedin.com/in/jane-doe-advocate"
  },
  "analytics": {
    "postsFound": 3,
    "totalLikes": 340,
    "totalComments": 45,
    "totalShares": 12,
    "totalImpressions": 8500,
    "averageLikes": 113.33,
    "averageComments": 15,
    "averageShares": 4,
    "averageImpressions": 2833.33,
    "averageEngagementRate": 4.67,
    "highestEngagementPost": { ... },
    "highestViewedPost": { ... },
    "lowestPerformingPost": { ... }
  },
  "posts": [
    {
      "activityUrn": "urn:li:activity:7123456789012345678",
      "text": "Post content text here...",
      "postUrl": "https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678",
      "postedRelative": "2d",
      "numLikes": 210,
      "numComments": 30,
      "numShares": 8,
      "numImpressions": 4500,
      "engagementScore": 248,
      "engagementRate": 5.51,
      "reactionBreakdown": [ ... ],
      "missingUpdateObject": false,
      "rank": 1
    }
  ]
}
```

See [sample-output.json](sample-output.json) for a complete mock representation of the returned payload.

---

## Repository Structure

```
linkedin-cookie-analytics/
├── .gitignore          # Git exclusion rules for node_modules, logs, and secrets
├── LICENSE             # MIT License details
├── CHANGELOG.md        # Log of versioned changes
├── README.md           # Documentation and setup instructions
├── index.js            # Refactored modular JavaScript implementation
├── sample-output.json  # Complete example of the analytics output schema
└── workflow.json       # Copy-pasteable n8n workflow configuration
```

---

## Limitations

- **Session Expiration**: LinkedIn session cookies expire periodically. You will need to refresh the `li_at` and `JSESSIONID` cookies in your n8n configuration when this happens.
- **Undocumented API**: The Voyager API is LinkedIn's internal endpoint. This means endpoints, schemas, query parameters, or query IDs can change without warning, which might cause the integration to break.
- **Rate Limits**: Excessive polling may lead to temporary rate-limiting (HTTP 429). It is recommended to run this workflow on a scheduled cron trigger no more than once per hour.

---

## Disclaimer

This project is not affiliated, associated, authorized, endorsed by, or in any way officially connected with LinkedIn Corporation. Using internal APIs violates LinkedIn's User Agreement under section 8.2 (prohibiting scraping, cloning, or using automated tools without permission). Use this utility responsibly and at your own risk.

---

## Future Improvements

- Add support for pagination to fetch historical posts older than the recent 20 posts.
- Auto-extract and chart engagement changes week-over-week.
- Send discord/slack alerts notifying users when a post is performing above the average engagement threshold.

---

## Contributing

Contributions are welcome! Please open an issue or submit a pull request if you discover schema changes or have feature suggestions.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
