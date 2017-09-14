import minimist from 'minimist'
import moment from 'moment'
import Promise from 'bluebird'
import bunyan from 'bunyan'
import PostgresClient from '../libs/PostgresClient'
import Aws from '../libs/Aws'
import CfbApi from '../libs/CfbApi'
import Events from '../libs/Events'
import Teams from '../libs/Teams'
import config from '../config'

const argv = minimist(process.argv.slice(2), { string: [ 's', 'start', 'e', 'end' ] })
const log = bunyan.createLogger(config.logger.options)

const postgres = new PostgresClient()
const events = Events(postgres)
const teams = Teams(postgres)
const aws = Aws().S3
const api = CfbApi()

;(async () => {
  try {
    const startDate = moment(argv.s || argv.start)
    const timeSpan = argv.t || argv.span
    let endDate = moment(argv.e || argv.end)

    switch (timeSpan) {
      case 'month':
        endDate = startDate.add(1, 'month')
        break
      case 'week':
        endDate = startDate.add(1, 'week')
        break
    }

    if (!(startDate.isValid() && endDate.isValid()))
      return log.error("Make sure any dates you enter are in the form of YYYY-MM-DD.")

    // for (let currentDate = startDate; currentDate.diff(endDate, 'days') <= 0; currentDate.add(1, 'days')) {
    const daysIterable = new Array(endDate.diff(startDate, 'days')).fill(0).map((zero, i) => i).reverse()
    await Promise.each(daysIterable, async daysToSubtract => {
      log.info(`On day ${daysIterable.length - daysToSubtract}`)
      const currentDate = moment().subtract(daysToSubtract, 'days')

      const apiResponse = await api.getEventsByDate(currentDate)
      if (!apiResponse.games)
        return

      await Promise.each(apiResponse.games, async game => {
          try {
            teams.resetRecord()
            events.resetRecord()

            log.debug("Updating event", game)

            // Check teams for game and whether they exist in the database,
            // insert them if not, otherwise move on to the event data
            const homeTeam = game.homeTeam
            const awayTeam = game.awayTeam

            log.debug("Home Team", homeTeam)
            log.debug("Away Team", awayTeam)
            const homeExists = await teams.findByColumn(homeTeam.location, 'location')
            if (!homeExists) {
              const bufferHome = await api.getImageBuffer(homeTeam.logoUrl)
              let imageNameHome = homeTeam.logoUrl.split('/')
              imageNameHome = `ncaaf/${imageNameHome[imageNameHome.length - 1]}`
              await aws.writeFile({data: bufferHome, exact_filename: true, filename: imageNameHome})

              teams.setRecord({
                location:                 homeTeam.location,
                name:                     homeTeam.name,
                full_name:                homeTeam.displayName,
                abbreviation:             homeTeam.abbreviation,
                team_color:               homeTeam.color,
                logo_url:                 homeTeam.logoUrl,
                logo_local_filename:      imageNameHome,
                stats_url:                homeTeam.links.stats,
                schedule_url:             homeTeam.links.schedule,
                scores_url:               homeTeam.links.scores,
                conference_abbreviation:  homeTeam.conference.abbreviation,
                conference_name:          homeTeam.conference.name
              })
              log.debug("Home Team to insert", teams.record)
              await teams.save('location')
            }
            const homeTeamId = teams.record.id

            teams.resetRecord()

            const awayExists = await teams.findByColumn(awayTeam.location, 'location')
            if (!awayExists) {
              const bufferAway = await api.getImageBuffer(awayTeam.logoUrl)
              let imageNameAway = awayTeam.logoUrl.split('/')
              imageNameAway = `ncaaf/${imageNameAway[imageNameAway.length - 1]}`
              await aws.writeFile({data: bufferAway, exact_filename: true, filename: imageNameAway})

              teams.setRecord({
                location:                 awayTeam.location,
                name:                     awayTeam.name,
                full_name:                awayTeam.displayName,
                abbreviation:             awayTeam.abbreviation,
                team_color:               awayTeam.color,
                logo_url:                 awayTeam.logoUrl,
                logo_local_filename:      imageNameAway,
                stats_url:                awayTeam.links.stats,
                schedule_url:             awayTeam.links.schedule,
                scores_url:               awayTeam.links.scores,
                conference_abbreviation:  awayTeam.conference.abbreviation,
                conference_name:          awayTeam.conference.name
              })
              log.debug("Away Team to insert", teams.record)
              await teams.save('location')
            }
            const awayTeamId = teams.record.id

            // Handle inserting / updating events
            events.setRecord({
              espn_event_id:        parseInt(game.id),
              home_team_id:         homeTeamId,
              visiting_team_id:     awayTeamId,
              home_team_score:      game.scores.home,
              visiting_team_score:  game.scores.away,
              current_period:       game.status.period,
              current_clock:        game.status.clock,
              event_status:         game.status.type,
              odds_spread:          game.odds.spread,
              odds_over_under:      game.odds.overUnder,
              event_timestamp:      moment.utc(game.date).toDate()
            })
            await events.save('espn_event_id')

          } catch(err) {
            log.error("Error processing event", err)
          }
        }
      )
    })

    log.info("Successfully updated events!")
    process.exit()

  } catch(err) {
    log.error("Error", err)
    process.exit()
  }
})()
