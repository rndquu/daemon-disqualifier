import { getWatchedRepos } from "../helpers/get-watched-repos";
import { updateReminder } from "../helpers/task-update";
import { ListForOrg, ListIssueForRepo } from "../types/github-types";
import { ContextPlugin } from "../types/plugin-input";

export async function watchUserActivity(context: ContextPlugin) {
  const { logger } = context;

  const repos = await getWatchedRepos(context);

  if (!repos?.length) {
    return { message: logger.info("No watched repos have been found, no work to do.").logMessage.raw };
  }

  await Promise.all(
    repos.map(async (repo) => {
      // uusd.ubq.fi
      logger.debug(`> Watching user activity for repo: ${repo.name} (${repo.html_url})`);
      await updateReminders(context, repo);
    })
  );

  return { message: "OK" };
}

async function updateReminders(context: ContextPlugin, repo: ListForOrg["data"][0]) {
  const { logger, octokit, payload } = context;
  const owner = payload.repository.owner?.login;
  if (!owner) {
    throw new Error("No owner found in the payload");
  }
  const issues = (await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner,
    repo: repo.name,
    per_page: 100,
    state: "open",
  })) as ListIssueForRepo[];

  await Promise.all(
    issues
      .filter((o) => o.html_url === "https://github.com/ubiquity/uusd.ubq.fi/issues/1")
      .map(async (issue) => {
        // I think we can safely ignore the following
        if (issue.draft || issue.pull_request || issue.locked || issue.state !== "open") {
          logger.debug("Skipping issue due to the issue state.", { issue });
          return;
        }

        if (issue.assignees?.length || issue.assignee) {
          // uusd-ubq-fi
          logger.debug(`Checking assigned issue: ${issue.html_url}`);
          await updateReminder(context, repo, issue);
        } else {
          logger.info("Skipping issue because no user is assigned.", { issue });
        }
      })
  );
}
