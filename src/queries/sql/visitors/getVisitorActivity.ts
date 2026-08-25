import prisma from '@/lib/prisma';
import { EVENT_TYPE } from '@/lib/constants';

const FUNCTION_NAME = 'getVisitorActivity';

export interface VisitorActivityFilters {
  distinctIds: string[];
  sessionIds: string[];
  // optional: a visitor's history is the point, so the default is all of it
  startDate?: Date;
  endDate?: Date;
  interestEvents: string[];
  pageLimit: number;
  eventLimit: number;
  websiteLimit: number;
}

export interface VisitorActivity {
  pageviews: number;
  pages: { path: string; count: number }[];
  events: {
    id: string;
    name: string | null;
    urlPath: string;
    createdAt: Date;
    data: Record<string, string | number | Date>;
  }[];
  otherWebsites: {
    websiteId: string;
    name: string;
    domain: string | null;
    pageviews: number;
    showedInterest: boolean;
  }[];
}

interface EventRow {
  id: string;
  name: string | null;
  urlPath: string;
  createdAt: Date;
  dataKey: string | null;
  stringValue: string | null;
  numberValue: number | null;
  dateValue: Date | null;
}

/**
 * Resolves the visitor to a set of session ids once, up front.
 *
 * The obvious form — joining session and filtering
 * `session.distinct_id = any(...) or website_event.session_id = any(...)` — puts
 * an OR across two tables, which no index can satisfy, so Postgres sequentially
 * scans every event on the instance. Resolving the identity first lets the
 * distinct id use an index and the events be looked up by session id.
 *
 * Session ids cover what the visitor did before they were identified; the
 * distinct id covers everything after, and is the only key that spans websites.
 * `union` rather than `union all` so a session matching both is counted once.
 */
const VISITOR_SESSIONS = `with visitor_sessions as (
    select session_id from session where distinct_id = any({{distinctIds}})
    union
    select unnest({{sessionIds}}::uuid[])
  )`;

const JOIN_VISITOR_SESSIONS = `join visitor_sessions
    on visitor_sessions.session_id = website_event.session_id`;

export async function getVisitorActivity(
  websiteId: string,
  filters: VisitorActivityFilters,
): Promise<VisitorActivity> {
  const { rawQuery } = prisma;
  const bounded = !!filters.startDate && !!filters.endDate;
  const dateMatch = bounded
    ? 'and website_event.created_at between {{startDate}} and {{endDate}}'
    : '';
  const params = {
    websiteId,
    distinctIds: filters.distinctIds,
    sessionIds: filters.sessionIds,
    ...(bounded
      ? { startDate: filters.startDate, endDate: filters.endDate }
      : {}),
  };

  const pages: { path: string; count: number }[] = await rawQuery(
    `
    ${VISITOR_SESSIONS}
    select website_event.url_path as "path", count(*)::int as "count"
    from website_event
    ${JOIN_VISITOR_SESSIONS}
    where website_event.website_id = {{websiteId::uuid}}
      ${dateMatch}
      and website_event.event_type = ${EVENT_TYPE.pageView}
    group by website_event.url_path
    order by count(*) desc
    limit ${filters.pageLimit}
    `,
    params,
    FUNCTION_NAME,
  );

  // one row per event property, folded below — joining the data in avoids a
  // request per event just to read what an event carried
  const eventRows: EventRow[] = await rawQuery(
    `
    ${VISITOR_SESSIONS}
    select website_event.event_id as "id",
      website_event.event_name as "name",
      website_event.url_path as "urlPath",
      website_event.created_at as "createdAt",
      event_data.data_key as "dataKey",
      event_data.string_value as "stringValue",
      event_data.number_value::float8 as "numberValue",
      event_data.date_value as "dateValue"
    from website_event
    ${JOIN_VISITOR_SESSIONS}
    left join event_data
      on event_data.website_event_id = website_event.event_id
      and event_data.website_id = website_event.website_id
    where website_event.website_id = {{websiteId::uuid}}
      ${dateMatch}
      and website_event.event_type = ${EVENT_TYPE.customEvent}
    order by website_event.created_at desc
    limit ${filters.eventLimit}
    `,
    params,
    FUNCTION_NAME,
  );

  const otherWebsites: VisitorActivity['otherWebsites'] = await rawQuery(
    `
    ${VISITOR_SESSIONS}
    select website.website_id as "websiteId",
      website.name as "name",
      website.domain as "domain",
      count(*) filter (where website_event.event_type = ${EVENT_TYPE.pageView})::int as "pageviews",
      coalesce(bool_or(website_event.event_type = ${EVENT_TYPE.customEvent}
        and website_event.event_name = any({{interestEvents}})), false) as "showedInterest"
    from website_event
    ${JOIN_VISITOR_SESSIONS}
    join website
      on website.website_id = website_event.website_id
      and website.deleted_at is null
    where website_event.website_id != {{websiteId::uuid}}
      ${dateMatch}
    group by website.website_id, website.name, website.domain
    order by "pageviews" desc
    limit ${filters.websiteLimit}
    `,
    { ...params, interestEvents: filters.interestEvents },
    FUNCTION_NAME,
  );

  return {
    pageviews: pages.reduce((total, page) => total + page.count, 0),
    pages,
    events: foldEventData(eventRows),
    otherWebsites,
  };
}

function foldEventData(rows: EventRow[]): VisitorActivity['events'] {
  const events = new Map<string, VisitorActivity['events'][number]>();

  for (const row of rows) {
    const event = events.get(row.id) ?? {
      id: row.id,
      name: row.name,
      urlPath: row.urlPath,
      createdAt: row.createdAt,
      data: {},
    };

    if (row.dataKey !== null) {
      const value = row.stringValue ?? row.numberValue ?? row.dateValue;

      if (value !== null && value !== undefined) {
        event.data[row.dataKey] = value;
      }
    }

    events.set(row.id, event);
  }

  return [...events.values()];
}
