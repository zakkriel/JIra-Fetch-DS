const fetch = require('node-fetch');
const base64 = require('base-64');
const { formatDateForJQL } = require('../helpers/formatDateForJQL');
const { extractTransitions } = require('../helpers/extractTransitions');

const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

function calculateDuration(startDate, endDate) {
  return endDate - startDate;
}

async function fetchAggregatedDurations(req, res) {
  const projectKey = req.query.projectKey;
  const from = req.query.from;
  const to = req.query.to;

  if (!projectKey || !from || !to) {
    return res.status(400).json({ error: 'Project key, from, and to are required' });
  }

  const fromDate = new Date(parseInt(from));
  const toDate = new Date(parseInt(to));

  const fromDateFormatted = formatDateForJQL(fromDate);
  const toDateFormatted = formatDateForJQL(toDate);
  
  const projectKeyString = projectKey.toString();
  const jql = `project in (${projectKeyString.replace(/[{}]/g, '')}) AND status changed TO "Done" AFTER "${fromDateFormatted}" AND status changed TO "Done" BEFORE "${toDateFormatted}" ORDER BY issueKey DESC`;
  const url = `https://digistore.atlassian.net/rest/api/3/search?jql=${encodeURIComponent(jql)}&expand=changelog&maxResults=5000`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${base64.encode(`${JIRA_USERNAME}:${JIRA_API_TOKEN}`)}`,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    const aggregatedDurations = [];

    data.issues.forEach(issue => {
      const issueTransitions = extractTransitions(issue);

      issueTransitions.forEach(transition => {
        const { startTime, endTime, status } = transition;
        const duration = calculateDuration(new Date(startTime), new Date(endTime));

        aggregatedDurations.push({
          duration,
          issueType: issue.fields.issuetype ? issue.fields.issuetype.name : null,
          key: issue.key,
          status
        });
      });
    });

    res.json(aggregatedDurations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch issues from JIRA' });
  }
}

module.exports = fetchAggregatedDurations;
