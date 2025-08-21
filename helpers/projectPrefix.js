function getJiraIssuePrefix(projectName) {
    // Define the mapping of project names to JIRA prefixes
    const projectKeyMap = {
        "Trust": "TR-*",
        "Money & Analytics": "DS-*",
        "Digibiz": "OCB-*",
    };

    // Return the corresponding prefix or a default value
    return projectKeyMap[projectName] || "UNKNOWN-";
}

module.exports = { getJiraIssuePrefix };