"use client"

import { useState, useCallback } from "react"
import { pickTriviaQuestions } from "@/lib/money-town/gameLogic"
import type { TriviaQuestion } from "@/lib/money-town/types"

interface Props {
  usedTriviaIds: string[]
  onComplete: (cashEarned: number, triviaIds: string[]) => void
}

type QuestionState = 'unanswered' | 'correct' | 'wrong'

export default function Trivia({ usedTriviaIds, onComplete }: Props) {
  const [questions] = useState<TriviaQuestion[]>(() => pickTriviaQuestions(usedTriviaIds, 3))
  const [currentQ, setCurrentQ] = useState(0)
  const [states, setStates] = useState<QuestionState[]>(['unanswered', 'unanswered', 'unanswered'])
  const [done, setDone] = useState(false)

  const q = questions[currentQ]
  const totalCorrect = states.filter(s => s === 'correct').length

  const answer = useCallback((optionIndex: number) => {
    const correct = optionIndex === q.correctIndex
    const newStates = [...states]
    newStates[currentQ] = correct ? 'correct' : 'wrong'
    setStates(newStates)

    setTimeout(() => {
      if (currentQ < 2) {
        setCurrentQ(prev => prev + 1)
      } else {
        setDone(true)
      }
    }, 800)
  }, [q, currentQ, states])

  if (done) {
    const earned = totalCorrect * 75
    const triviaIds = questions.map(q => q.id)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">🧠</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Trivia Done!</h2>
        <p className="text-gray-500 mb-4">{totalCorrect} / 3 correct</p>
        <div className="text-4xl font-black text-green-600 mb-8">+${earned}</div>
        <button
          type="button"
          onClick={() => onComplete(earned, triviaIds)}
          className="px-10 py-4 bg-green-500 text-white text-xl font-black rounded-3xl shadow-md active:scale-95 transition-transform"
        >
          Collect! 🎉
        </button>
      </div>
    )
  }

  const state = states[currentQ]

  return (
    <div className="min-h-screen flex flex-col p-6 pt-10">
      <div className="flex gap-1.5 mb-8 justify-center">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className={`h-2 flex-1 max-w-16 rounded-full ${
              i < currentQ ? (states[i] === 'correct' ? 'bg-green-500' : 'bg-red-400')
              : i === currentQ ? 'bg-yellow-400'
              : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      <div className="text-center mb-2">
        <div className="text-4xl mb-3">🧠</div>
        <div className="text-xs text-gray-400 mb-1">Question {currentQ + 1} of 3 · $75 each</div>
      </div>

      <p className="text-lg font-black text-gray-900 text-center mb-6">{q.question}</p>

      <div className="space-y-3">
        {q.options.map((opt, i) => {
          let style = 'border-2 border-gray-200 bg-white text-gray-800'
          if (state !== 'unanswered') {
            if (i === q.correctIndex) style = 'border-2 border-green-400 bg-green-50 text-green-800'
            else if (state === 'wrong' && i !== q.correctIndex) style = 'border-2 border-gray-200 bg-white text-gray-400'
          }
          return (
            <button
              key={i}
              type="button"
              disabled={state !== 'unanswered'}
              onClick={() => answer(i)}
              className={`w-full py-3 px-4 rounded-2xl font-bold text-sm text-left active:scale-95 transition-all ${style}`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
