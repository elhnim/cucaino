"use client"

import type { ResultPayload, Player, GameState, GameAction } from "@/lib/money-town/types"
import { ASSETS, DEGREE_JOBS } from "@/lib/money-town/constants"

interface Props {
  result: ResultPayload
  player: Player
  state: GameState
  dispatch: (action: GameAction) => void
}

const TONE_STYLES = {
  good:    'from-green-500 to-green-600',
  bad:     'from-red-500 to-red-600',
  neutral: 'from-blue-500 to-blue-600',
}

export default function ResultCard({ result, player, state, dispatch }: Props) {
  const headerGrad = TONE_STYLES[result.tone]

  const offerDef = result.offerAssetDefId ? ASSETS.find(a => a.id === result.offerAssetDefId) : null
  const offerCost = offerDef ? Math.floor(offerDef.cost * (result.offerDiscount ?? 1)) : 0
  const canAffordOffer = offerDef ? player.cash >= offerCost : false

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden">
        {/* Header */}
        <div className={`bg-gradient-to-br ${headerGrad} px-6 py-5 text-center`}>
          <div className="text-5xl mb-2">{result.emoji}</div>
          <h2 className="text-xl font-black text-white">{result.title}</h2>
          {result.kind === 'big-event' && (
            <span className="inline-block mt-1 bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              💥 Big Event
            </span>
          )}
          {result.kind === 'chance' && (
            <span className="inline-block mt-1 bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              🌟 Chance
            </span>
          )}
        </div>

        <div className="p-5">
          <p className="text-sm text-gray-600 text-center mb-4">{result.description}</p>

          {/* Delta badges */}
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {result.cashDelta !== 0 && (
              <span className={`text-sm font-black px-3 py-1 rounded-full ${result.cashDelta > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {result.cashDelta > 0 ? '+' : ''}${result.cashDelta.toLocaleString()} cash
              </span>
            )}
            {result.salaryDelta !== 0 && (
              <span className="text-sm font-black px-3 py-1 rounded-full bg-blue-100 text-blue-700">
                +${result.salaryDelta.toLocaleString()} salary
              </span>
            )}
            {result.expensesDelta !== 0 && (
              <span className={`text-sm font-black px-3 py-1 rounded-full ${result.expensesDelta > 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                {result.expensesDelta > 0 ? '+' : ''}${result.expensesDelta.toLocaleString()} expenses
              </span>
            )}
          </div>

          {/* Career Switch offer */}
          {result.offerCareerSwitch && (
            <div className="space-y-2 mb-4">
              <p className="text-xs text-gray-500 text-center font-bold">Choose your new career:</p>
              {DEGREE_JOBS.map(job => (
                <button key={job.id} type="button"
                  onClick={() => dispatch({ type: 'SWITCH_CAREER', jobId: job.id })}
                  className="w-full flex items-center gap-3 bg-blue-50 border-2 border-blue-200 rounded-2xl px-4 py-3 active:scale-95 transition-transform hover:border-blue-400">
                  <span className="text-2xl">{job.emoji}</span>
                  <div className="flex-1 text-left">
                    <div className="font-black text-blue-900 text-sm">{job.name}</div>
                    <div className="text-xs text-blue-600">${job.salary.toLocaleString()}/turn · exp ${job.expenses.toLocaleString()}</div>
                  </div>
                </button>
              ))}
              <button type="button"
                onClick={() => dispatch({ type: 'DISMISS_RESULT' })}
                className="w-full py-2 text-gray-400 text-sm font-bold hover:text-gray-600">
                Skip →
              </button>
            </div>
          )}

          {/* Asset offer */}
          {offerDef && !result.offerCareerSwitch && (
            <div className="mb-4">
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-4 mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{offerDef.emoji}</span>
                  <div>
                    <div className="font-black text-gray-900">{offerDef.name}</div>
                    <div className="text-sm text-gray-600">
                      ${offerCost.toLocaleString()}
                      {result.offerDiscount && result.offerDiscount < 1 && (
                        <span className="ml-1 text-xs text-green-600 font-bold">({Math.round((1 - result.offerDiscount) * 100)}% off)</span>
                      )}
                      {' · '}+${offerDef.income.toLocaleString()}/turn
                    </div>
                  </div>
                </div>
              </div>
              <button type="button"
                onClick={() => dispatch({ type: 'BUY_ASSET', defId: offerDef.id, discount: result.offerDiscount })}
                disabled={!canAffordOffer}
                className="w-full py-3 bg-green-500 text-white font-black rounded-2xl disabled:opacity-40 active:scale-95 transition-transform mb-2">
                {canAffordOffer ? `Buy for $${offerCost.toLocaleString()}` : `Need $${(offerCost - player.cash).toLocaleString()} more`}
              </button>
              <button type="button"
                onClick={() => dispatch({ type: 'DISMISS_RESULT' })}
                className="w-full py-2 text-gray-400 text-sm font-bold hover:text-gray-600">
                Skip →
              </button>
            </div>
          )}

          {/* Standard dismiss */}
          {!result.offerCareerSwitch && !offerDef && (
            <button type="button"
              onClick={() => dispatch({ type: 'DISMISS_RESULT' })}
              className={`w-full py-4 text-white text-lg font-black rounded-2xl active:scale-95 transition-transform bg-gradient-to-r ${headerGrad}`}>
              {result.tone === 'bad' ? 'Ouch! OK 😬' : result.tone === 'good' ? 'Nice! 🙌' : 'OK!'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
