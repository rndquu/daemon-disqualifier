import { EmitterWebhookEvent as WebhookEvent, EmitterWebhookEventName as WebhookEventName } from "@octokit/webhooks";
import { StaticDecode, StringOptions, Type as T, TypeBoxError } from "@sinclair/typebox";
import ms from "ms";

export type SupportedEvents = "pull_request_review_comment.created" | "issue_comment.created" | "push";

export interface PluginInputs<T extends WebhookEventName = SupportedEvents> {
  stateId: string;
  eventName: T;
  eventPayload: WebhookEvent<T>["payload"];
  settings: UserActivityWatcherSettings;
  authToken: string;
  ref: string;
}

function thresholdType(options?: StringOptions) {
  return T.Transform(T.String(options))
    .Decode((value) => {
      const milliseconds = ms(value);
      if (milliseconds === undefined) {
        throw new TypeBoxError(`Invalid threshold value: [${value}]`);
      }
      return milliseconds;
    })
    .Encode((value) => {
      const textThreshold = ms(value, { long: true });
      if (textThreshold === undefined) {
        throw new TypeBoxError(`Invalid threshold value: [${value}]`);
      }
      return textThreshold;
    });
}

const eventWhitelist = [
  "pull_request.review_requested",
  "pull_request.ready_for_review",
  "pull_request_review_comment.created",
  "issue_comment.created",
  "push",
]

type WhitelistEvents = typeof eventWhitelist[number];
type TimelineEvents = "review_requested" | "ready_for_review" | "commented" | "committed";

function mapWebhookToEvent(webhook: string) {
  const roleMap: Map<WhitelistEvents, TimelineEvents> = new Map([
    ["pull_request.review_requested", "review_requested"],
    ["pull_request.ready_for_review", "ready_for_review"],
    ["pull_request_review_comment.created", "commented"],
    ["issue_comment.created", "commented"],
    ["push", "committed"],
  ]);

  return roleMap.get(webhook);
}

export const userActivityWatcherSettingsSchema = T.Object(
  {
    /**
     * Delay to send reminders. 0 means disabled. Any other value is counted in days, e.g. 1,5 days
     */
    warning: thresholdType({ default: "3.5 days" }),
    /**
     * By default all repositories are watched. Use this option to opt-out from watching specific repositories
     * within your organization. The value is an array of repository names.
     */
    watch: T.Object({
      optOut: T.Array(T.String()),
    }),
    /**
     * Delay to unassign users. 0 means disabled. Any other value is counted in days, e.g. 7 days
     */
    disqualification: thresholdType({
      default: "7 days",
    }),
    /**
     * List of events to consider as valid activity on a task
     */
    eventWhitelist: T.Transform(T.Array(T.String(), { default: eventWhitelist })).Decode((value) => {
      const validEvents = Object.values(eventWhitelist);
      let eventsStripped = []
      for (const event of value) {
        if (!validEvents.includes(event)) {
          throw new TypeBoxError(`Invalid event [${event}]`);
        }

        eventsStripped.push(mapWebhookToEvent(event));
      }

      return eventsStripped as TimelineEvents[];
    })
      .Encode((value) => value.map((event) => {
        const roleMap: Map<TimelineEvents, WhitelistEvents> = new Map([
          ["review_requested", "pull_request.review_requested"],
          ["ready_for_review", "pull_request.ready_for_review"],
          ["commented", "pull_request_review_comment.created"],
          ["commented", "issue_comment.created"],
          ["committed", "push"],
        ]);

        return roleMap.get(event as TimelineEvents) as WhitelistEvents;
      })),
  },
  { default: {} }
);

export type UserActivityWatcherSettings = StaticDecode<typeof userActivityWatcherSettingsSchema>;
