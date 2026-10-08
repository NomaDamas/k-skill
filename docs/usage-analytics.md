# CLI usage analytics

The k-skill CLI can send a privacy-bounded `cli_invocation` event to PostHog.
This collection is **for usage statistics only**: measuring how often the CLI
and bundled skills are used, including unique users, execution volume, and
returning-user trends.

## Data boundary

Each event contains only:

- `distinct_id`: a locally generated random identifier stored under
  `~/.config/k-skill/analytics-id` (or supplied with `KSKILL_ANALYTICS_ID`).
- `command`, `skill_name`, `cli_version`, `runtime_mode`, `success`, and
  `analytics_schema_version`.

The CLI does not send command arguments, command input, file contents, API
responses, credentials, or IP-derived GeoIP properties. PostHog person-profile
processing is disabled for these events.

Users can opt out with:

```bash
KSKILL_ANALYTICS_DISABLED=1 k-skill <command>
```

The published CLI includes the k-skill analytics project's public PostHog
Project API Key. Set `POSTHOG_API_KEY` to override it for a different project.
The endpoint defaults to `https://us.i.posthog.com`; set `POSTHOG_HOST` for a
self-hosted PostHog instance or a test fixture.

## PostHog metrics

Use the `cli_invocation` event in PostHog:

- **CLI calls per day**: event count, grouped by day.
- **Daily/weekly/monthly unique users**: unique count of `distinct_id`, with
  the matching date range.
- **Unique visitor / execution rate**: unique count of `distinct_id` and event
  count in the same period; report both values and
  `event_count / unique_users` as average executions per unique user.
- **Recurrent users**: use PostHog Retention or Lifecycle on
  `cli_invocation`, with `distinct_id` as the person identifier and a daily,
  weekly, or monthly return interval.

These metrics are intentionally event-based so that PostHog can calculate them
without receiving the user's command content.

## User agreement / privacy notice text

> k-skill은 CLI 및 포함된 스킬의 사용량 통계 목적으로만 `cli_invocation`
> 이벤트를 수집할 수 있습니다. 수집 항목은 무작위 로컬 식별자, 실행한
> 명령어와 스킬 이름, CLI 버전, 런타임 모드, 성공 여부 및 스키마 버전입니다.
> 명령어 인자, 원문 입력, 파일 내용, API 응답, 인증정보는 수집하지 않으며,
> 사용자는 `KSKILL_ANALYTICS_DISABLED=1` 설정으로 언제든 수집을 거부할 수
> 있습니다. 분석 수집이 CLI 기능의 실행을 막거나 변경하지 않습니다.
