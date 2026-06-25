# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-25

### Added
- **Profile Retrieval**: Fetch authenticated user's profile details and resolve Voyager URN pointer to extract profile identifiers.
- **Post & Feed Retrieval**: Query recent updates and activities via LinkedIn Voyager GraphQL endpoints.
- **Analytics Engine**: Extract and compile core metrics (likes, comments, shares, impressions) and rank posts by custom engagement scoring.
- **Comprehensive Summary Statistics**: Compute averages, total aggregates, and highlight top/bottom performing posts.
- **n8n Workflow Integration**: Pre-configured JSON workflow for easy import and setup.
- **Documentation**: Extensive README including cookie extraction steps, API limitations, and architectural overview.
