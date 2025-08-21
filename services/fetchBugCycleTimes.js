const fetch = require('node-fetch');
const base64 = require('base-64');
const { formatDateForJQL } = require('../helpers/formatDateForJQL');
const { calculateWorkingTimeInMilliseconds } = require('../helpers/calculateWorkingTime');

require('dotenv').config();

const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

async function fetchBugCycleTimes(req, res) {
    const projectKey = req.query.projectKey;
    const issueType = req.query.issueType;
    const from = req.query.from;
    const to = req.query.to;

    if (!projectKey || !from || !to ||!issueType) {
        return res.status(400).json({ error: 'Projects, from, issueType, and to are required' });
    }

    const fromDate = new Date(parseInt(from));
    const toDate = new Date(parseInt(to));

    const fromDateFormatted = formatDateForJQL(fromDate);
    const toDateFormatted = formatDateForJQL(toDate);

    const projectKeyString = projectKey.toString();
    const issueTypeString = issueType.toString();
    const jql = `project in (${projectKeyString.replace(/[{}]/g, '')}) AND issuetype in (${issueTypeString.replace(/[{}]/g, '')}) AND resolutiondate >= "${fromDateFormatted}" AND resolutiondate <= "${toDateFormatted}" ORDER BY issueKey DESC`;
    const url = `https://digistore.atlassian.net/rest/api/3/search?jql=${encodeURIComponent(jql)}&expand=changelog&maxResults=10000`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${base64.encode(`${JIRA_USERNAME}:${JIRA_API_TOKEN}`)}`,
                'Accept': 'application/json'
            }
        });

        const data = await response.json();
        const issuesData = data.issues.map(issue => {
            const inProgressChange = issue.changelog.histories.reverse().find(history =>
                history.items.some(item => item.field === 'status' && item.toString === 'In Progress')
            );

            const inProgressAt = inProgressChange ? new Date(inProgressChange.created) : null;
            const resolutionDate = issue.fields.resolutiondate ? new Date(issue.fields.resolutiondate) : null;


            if (!resolutionDate || !inProgressAt) {
                return null; // Skip this issue if resolution date or inProgressAt is null
            }

            const cycleTime = calculateWorkingTimeInMilliseconds(inProgressAt, resolutionDate);

            return {
                issueType: issue.fields.issuetype ? issue.fields.issuetype.name : null,
                project: issue.fields.project ? issue.fields.project.name : null,
                cycleTime: cycleTime,
                resolutionDate: issue.fields.resolutiondate,
                priority: issue.fields.priority ? issue.fields.priority.name : null,
                key: issue.key,
                labels: issue.fields.labels,
                planned: (issue.fields.labels || []).includes('Unplanned') ? 'Unplanned': (issue.fields.labels || []).includes('Planned') ? 'Planned' : (issue.fields.labels || []).includes('Baseline') ? 'Baseline' : null
            };
        }).filter(issue => issue !== null);

        res.json({ issues: issuesData });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch issues from JIRA' });
    }
}

module.exports = { fetchBugCycleTimes };
