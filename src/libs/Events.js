import config from '../config'
import DatabaseModel from './DatabaseModel'

export default function Events(postgres) {
  const factoryToExtend = DatabaseModel(postgres, 'events')

  return Object.assign(
    factoryToExtend,
    {
      accessibleColumns: [
        'api_uid', 'league_id', 'home_team_id', 'visiting_team_id', 'event_type',
        'home_team_score', 'visiting_team_score', 'current_period',
        'current_clock', 'event_status', 'odds_spread', 'odds_over_under',
        'event_timestamp', 'complete_json'
      ],

      async getAllByLeagueId(leagueId) {
        const { rows } = await postgres.query(`
          select
            th.full_name as home_full_name,
            th.abbreviation as home_abbreviation,
            th.location as home_location,
            th.team_color1 as home_team_color,
            th.logo_url as home_logo_url,
            th.conference_abbreviation as home_conference_abbreviation,
            tv.full_name as visiting_full_name,
            tv.abbreviation as visiting_abbreviation,
            tv.location as visiting_location,
            tv.team_color1 as visiting_team_color,
            tv.logo_url as visiting_logo_url,
            tv.conference_abbreviation as visiting_conference_abbreviation,
            e.id,
            e.api_uid,
            e.league_id,
            e.home_team_id,
            e.visiting_team_id,
            e.event_type,
            e.home_team_score,
            e.visiting_team_score,
            e.current_period,
            e.current_clock,
            e.event_status,
            e.odds_spread,
            e.odds_over_under,
            e.event_timestamp,
            e.created_at,
            e.updated_at
          from events as e
          inner join teams as th on th.id = e.home_team_id
          inner join teams as tv on tv.id = e.visiting_team_id
          inner join leagues as l on l.id = e.league_id and l.id = th.league_id and l.id = tv.league_id
          where l.id = $1
          order by e.event_timestamp;
        `, [ leagueId ])
        return rows
      },

      async getAllByTeamId(teamId) {
        const { rows } = await postgres.query(`
          select
            th.full_name as home_full_name,
            th.abbreviation as home_abbreviation,
            th.location as home_location,
            th.team_color1 as home_team_color,
            th.logo_url as home_logo_url,
            th.conference_abbreviation as home_conference_abbreviation,
            tv.full_name as visiting_full_name,
            tv.abbreviation as visiting_abbreviation,
            tv.location as visiting_location,
            tv.team_color1 as visiting_team_color,
            tv.logo_url as visiting_logo_url,
            tv.conference_abbreviation as visiting_conference_abbreviation,
            e.*
          from events as e
          inner join teams as th on th.id = e.home_team_id
          inner join teams as tv on tv.id = e.visiting_team_id
          where
            th.id = $1 or
            tv.id = $2
        `, [ teamId, teamId ])
        return rows
      }
    }
  )
}
