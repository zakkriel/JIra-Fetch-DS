const fetch = require("node-fetch");
const base64 = require("base-64");
const { formatDateForJQL } = require("../helpers/formatDateForJQL");
const calculateTimeseries = require("../helpers/calculateTimeseries");
const { calculateWorkingTimeInMilliseconds } = require("../helpers/calculateWorkingTime");

require("dotenv").config();

const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

async function fetchCycleTimeseries(req, res) {
    const projectKey = req.query.projectKey;
    const from = req.query.from;
    const to = req.query.to;

    if (!projectKey || !from || !to) {
        return res.status(400).json({ error: "Projects, from, and to are required" });
    }

    const fromDate = new Date(parseInt(from));
    const toDate = new Date(parseInt(to));

    const fromDateFormatted = formatDateForJQL(fromDate);
    const toDateFormatted = formatDateForJQL(toDate);
    const projectKeyString = projectKey.toString();
  
  /*
  
  
  
  
  */
    const jql = `project in (${projectKeyString.replace(/[{}]/g, "")}) AND statusCategory IN (Done) AND status changed TO "In Progress" AFTER "${fromDateFormatted}" AND status changed TO "In Progress" BEFORE "${toDateFormatted}" AND issuetype IN (Story, Sub-task, Subtask, task, Bug, Sub-Bug) ORDER BY updatedDate DESC`;
    const url = `https://digistore.atlassian.net/rest/api/3/search?jql=${encodeURIComponent(jql)}&expand=changelog&maxResults=1000`;

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Basic ${base64.encode(`${JIRA_USERNAME}:${JIRA_API_TOKEN}`)}`,
                Accept: "application/json",
            },
        });

        const data = await response.json();
        const timeseries = [];

        const biWeeklyCycles = calculateTimeseries(fromDate, toDate);

        data.issues.forEach((issue) => {
            const inProgressChanges = issue.changelog.histories
                .reverse()
                .filter((history) =>
                    history.items.some(
                        (item) => item.field === "status" && item.toString === "In Progress"
                    )
                );

                if ((issue.key == "TR-77")) {
        const checked = true;
      }
            // Select the first "In Progress" change within the entire issue history
            const firstInProgressChange = inProgressChanges[0];
            const inProgressAt = firstInProgressChange ? new Date(firstInProgressChange.created) : null;

            const resolutionDate = issue.fields.resolutiondate ? new Date(issue.fields.resolutiondate) : null;

            if (!resolutionDate || !inProgressAt) {
                return; // Skip this issue if resolution date or inProgressAt is null
            }

            biWeeklyCycles.forEach((cycle) => {
                const cycleEndDate = new Date(cycle);
                const cycleStartDate = new Date(cycleEndDate.getTime());
                cycleStartDate.setDate(cycleStartDate.getDate() - 14);

                if (resolutionDate >= cycleStartDate && resolutionDate <= cycleEndDate) {
                    const cycleTime = calculateWorkingTimeInMilliseconds(inProgressAt, resolutionDate);

                    if (cycleTime) {
                        timeseries.push({
                            date: cycleEndDate.getTime(),
                            projectName: issue.fields.project ? issue.fields.project.name : null,
                            cycleTime: cycleTime,
                            key: issue.key,
                        });
                    }
                }
            });
        });

        res.json(timeseries);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch issues from JIRA" });
    }
}

module.exports = { fetchCycleTimeseries };
