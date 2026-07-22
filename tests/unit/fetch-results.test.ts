import { describe, expect, it } from 'vitest'
import { parseUfcResultRows } from '../../src/server/services/fetch-results'

describe('UFC result page parsing', () => {
  it('extracts completed bouts from the current UFC markup', () => {
    const results = parseUfcResultRows(`
      <div class="c-listing-fight">
        <div class="c-listing-fight__outcome-wrapper">
          <div class="c-listing-fight__outcome--win">W</div>
        </div>
        <div class="c-listing-fight__corner-name c-listing-fight__corner-name--red">
          <a>Dricus Du Plessis</a>
        </div>
        <div class="c-listing-fight__corner-name c-listing-fight__corner-name--blue">
          <a>Kamaru Usman</a>
        </div>
        <div class="c-listing-fight__result-text round">5</div>
        <div class="c-listing-fight__result-text time">5:00</div>
        <div class="c-listing-fight__result-text method">Decision - Unanimous</div>
        <div class="c-listing-fight__outcome-wrapper">
          <div class="c-listing-fight__outcome--loss">L</div>
        </div>
      </div>
      <div class="c-listing-fight">
        <div class="c-listing-fight__outcome--loss">L</div>
        <div class="c-listing-fight__corner-name--red">Red Fighter</div>
        <div class="c-listing-fight__corner-name--blue">Blue Fighter</div>
        <div class="c-listing-fight__result-text round">2</div>
        <div class="c-listing-fight__result-text method">Submission</div>
        <div class="c-listing-fight__outcome--win">W</div>
      </div>
      <div class="c-listing-fight">
        <div class="c-listing-fight__corner-name--red">Pending Red</div>
        <div class="c-listing-fight__corner-name--blue">Pending Blue</div>
      </div>
    `)

    expect(results).toEqual([
      {
        fighterA: 'Dricus Du Plessis',
        fighterB: 'Kamaru Usman',
        winner: 'Dricus Du Plessis',
        status: 'winner',
        method: 'decision',
        round: '5',
      },
      {
        fighterA: 'Red Fighter',
        fighterB: 'Blue Fighter',
        winner: 'Blue Fighter',
        status: 'winner',
        method: 'submission',
        round: '2',
      },
    ])
  })

  it('retains support for the legacy UFC result markup', () => {
    const results = parseUfcResultRows(`
      <article class="c-listing-fight">
        <div class="c-listing-fight__corner-name--red">Legacy Red</div>
        <div class="c-listing-fight__outcome--red">L</div>
        <div class="c-listing-fight__corner-name--blue">Legacy Blue</div>
        <div class="c-listing-fight__outcome--blue">WIN</div>
        <div class="c-listing-fight__result-text">KO/TKO</div>
        <div class="c-listing-fight__result-round">3</div>
      </article>
    `)

    expect(results).toEqual([
      {
        fighterA: 'Legacy Red',
        fighterB: 'Legacy Blue',
        winner: 'Legacy Blue',
        status: 'winner',
        method: 'ko_tko',
        round: '3',
      },
    ])
  })

  it('extracts a no-contest without inventing a winner', () => {
    const results = parseUfcResultRows(`
      <div class="c-listing-fight">
        <div class="c-listing-fight__corner-name--red">Fighter One</div>
        <div class="c-listing-fight__corner-name--blue">Fighter Two</div>
        <div class="c-listing-fight__result-text round">1</div>
        <div class="c-listing-fight__result-text method">No Contest</div>
      </div>
    `)

    expect(results).toEqual([
      {
        fighterA: 'Fighter One',
        fighterB: 'Fighter Two',
        winner: null,
        status: 'no_contest',
        method: 'other',
        round: '1',
      },
    ])
  })
})
