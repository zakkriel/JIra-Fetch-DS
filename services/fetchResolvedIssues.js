const fetch = require("node-fetch");
const base64 = require("base-64");
const { formatDateForJQL } = require("../helpers/formatDateForJQL");
const { getJiraIssuePrefix } = require("../helpers/projectPrefix");
const {
  calculateWorkingTimeInMilliseconds,
} = require("../helpers/calculateWorkingTime");

const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

async function fetchResolvedIssues(req, res) {
  const projectKey = req.query.projectKey;
  const from = req.query.from;
  const to = req.query.to;

  if (!projectKey || !from || !to) {
    return res
      .status(400)
      .json({ error: "Project key, from, and to are required" });
  }

  const fromDate = new Date(parseInt(from));
  const toDate = new Date(parseInt(to));

  const fromDateFormatted = formatDateForJQL(fromDate);
  const toDateFormatted = formatDateForJQL(toDate);
  const projectKeyString = projectKey.toString();
  
  const projectPrefixed = getJiraIssuePrefix(projectKeyString);
  
  /*
  const jql = `issueKey ~ "${projectPrefixed}" AND statusCategory IN (Done) AND status changed TO "In Progress" AFTER "${fromDateFormatted}" AND status changed TO "In Progress" BEFORE "${toDateFormatted}" AND issuetype IN (Story, Sub-task, Subtask, task, Bug, Sub-Bug) ORDER BY updatedDate DESC`;
  
  
  */
  const jql = `project in (${projectKeyString.replace(/[{}]/g, '')}) AND statusCategory IN (Done) AND status changed TO "In Progress" AFTER "${fromDateFormatted}" AND status changed TO "In Progress" BEFORE "${toDateFormatted}" AND issuetype IN (Story, Sub-task, Subtask, task, Bug, Sub-Bug) ORDER BY updatedDate DESC`;
  
  const url = `https://digistore.atlassian.net/rest/api/3/search?jql=${encodeURIComponent(
    jql
  )}&expand=changelog&maxResults=1000`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${base64.encode(
          `${JIRA_USERNAME}:${JIRA_API_TOKEN}`
        )}`,
        Accept: "application/json",
      },
    });

    const data = await response.json();
    const simplifiedIssues = data.issues.map((issue) => {
      const inProgressChanges = issue.changelog.histories
        .reverse()
        .filter((history) =>
          history.items.some(
            (item) => item.field === "status" && item.toString === "In Progress"
          )
        );

      if (issue.key == "TR-77") {
        const checked = true;
      }
      // Select the first "In Progress" change within the entire issue history
      const firstInProgressChange = inProgressChanges[0];
      const inProgressAt = firstInProgressChange
        ? new Date(firstInProgressChange.created)
        : null;

      const resolutionDate = issue.fields.resolutiondate
        ? new Date(issue.fields.resolutiondate)
        : null;

      if (!resolutionDate || !inProgressAt) {
        return null; // Skip this issue if resolution date or inProgressAt is null
      }

      const cycleTime = calculateWorkingTimeInMilliseconds(
        inProgressAt,
        resolutionDate
      );

      return {
        key: issue.key,
        created: issue.fields.created,
        createdDateUNIX: new Date(issue.fields.created).getTime(),
        assigned: issue.fields.customfield_11972
          ? issue.fields.customfield_11972.displayName
          : issue.fields.assignee
          ? issue.fields.assignee.displayName
          : null,
        InProgressAt: inProgressAt ? inProgressAt.toISOString() : null,
        summary: issue.fields.summary,
        resolutionDate: issue.fields.resolutiondate,
        projectName: issue.fields.project ? issue.fields.project.name : null,
        cycleTime: cycleTime,
      };
    });

    res.json({ issues: simplifiedIssues.filter(issue => issue !== null) });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch issues from JIRA" });
  }
}

module.exports = fetchResolvedIssues;
