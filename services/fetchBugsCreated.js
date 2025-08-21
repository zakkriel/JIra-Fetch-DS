const fetch = require('node-fetch');
const base64 = require('base-64');
const { formatDateForJQL } = require('../helpers/formatDateForJQL');
const { calculateWorkingTimeInMilliseconds } = require('../helpers/calculateWorkingTime');

require('dotenv').config();

const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

async function fetchBugsCreated(req, res) {
        const { projectKey, from, to } = req.query;

        if (!projectKey || !from || !to) {
            return res.status(400).json({ error: 'Project, from and to are required' });
        }

        const fromDate = new Date(parseInt(from));
        const toDate = new Date(parseInt(to));

        const fromDateFormatted = formatDateForJQL(fromDate);
        const toDateFormatted = formatDateForJQL(toDate);

        // Prepare JQL query (remove braces if present)
        const projectKeyString = projectKey.toString().replace(/[{}]/g, '');
        const jql = `project in (${projectKeyString}) AND created >= "${fromDateFormatted}" AND created <= "${toDateFormatted}" ORDER BY issueKey DESC`;

        // Pagination variables
        const maxResults = 1000; // number of issues per page
        const maxTotal = 8000;   // limit to 8000 issues total
        let issuesAll = [];
        let startAt = 0;
        let totalIssues = Infinity;

        try {
            // Fetch pages until we've retrieved either all available issues or 8000 issues.
            do {
                const pageUrl = `https://digistore.atlassian.net/rest/api/3/search?jql=${encodeURIComponent(jql)}&expand=changelog&maxResults=${maxResults}&startAt=${startAt}`;
                const response = await fetch(pageUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Basic ${base64.encode(`${JIRA_USERNAME}:${JIRA_API_TOKEN}`)}`,
                        'Accept': 'application/json'
                    }
                });
                const data = await response.json();

                // Set the total number of matching issues from JIRA (first iteration)
                totalIssues = data.total;

                if (!data.issues || data.issues.length === 0) break;

                issuesAll.push(...data.issues);
                startAt += data.issues.length;

                // Continue until we've fetched 8000 issues or all available issues
            } while (issuesAll.length < maxTotal && startAt < totalIssues);

            // If more than maxTotal issues were fetched, slice down to exactly maxTotal.
            if (issuesAll.length > maxTotal) {
                issuesAll = issuesAll.slice(0, maxTotal);
            }

            // Process the issues: calculate cycle time and extract relevant fields
            const issuesData = issuesAll.map(issue => {


                return {
                    issueType: issue.fields.issuetype ? issue.fields.issuetype.name : null,
                    created: issue.fields.created,
                    createdDateUNIX: new Date(issue.fields.created).getTime(),
                    project: issue.fields.project ? issue.fields.project.name : null,
                    priority: issue.fields.priority ? issue.fields.priority.name : null,
                    key: issue.key,
                    labels: issue.fields.labels,
                    planned: (issue.fields.labels || []).includes('Unplanned')
                        ? 'Unplanned'
                        : (issue.fields.labels || []).includes('Planned')
                        ? 'Planned'
                        : (issue.fields.labels || []).includes('Baseline')
                        ? 'Baseline'
                        : null
                };
            }).filter(issue => issue !== null);

            res.json({ issues: issuesData });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to fetch issues from JIRA' });
        }
    }

module.exports = { fetchBugsCreated };
