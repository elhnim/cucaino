import type { JobDef, AssetDef, ReelSegment, ReflexGameId, PlayerColor } from './types'

export const STARTING_CASH = 800
export const DEGREE_COST = 900
export const DEGREE_TURNS = 2
export const MIN_TURNS_TO_WIN = 6
export const CASH_FLOOR = 200

/** Hard cap — at the end of round 12 the player closest to freedom wins.
    Keeps a 2-player game in the 5–10 minute range. */
export const MAX_ROUNDS = 12

/** Insurance shields: each absorbs one bad cash event */
export const INSURANCE_COST = 400
export const MAX_INSURANCE = 2

/** Assets sell back at 75% of list price */
export const SELL_RATIO = 0.75

/** Rotating market: 3 offers/turn with price swings — timing purchases is the strategy */
export const MARKET_SIZE = 3
export const MARKET_PRICE_MULTS = [0.8, 0.9, 1, 1, 1.1, 1.25]

export const PLAYER_COLORS: PlayerColor[] = ['red', 'blue', 'green', 'yellow']

export const PLAYER_COLOR_CLASSES: Record<PlayerColor, { bg: string; border: string; text: string; badge: string }> = {
  red:    { bg: 'bg-red-50',    border: 'border-red-400',    text: 'text-red-700',    badge: 'bg-red-500'    },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-400',   text: 'text-blue-700',   badge: 'bg-blue-500'   },
  green:  { bg: 'bg-green-50',  border: 'border-green-400',  text: 'text-green-700',  badge: 'bg-green-500'  },
  yellow: { bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-700', badge: 'bg-yellow-500' },
}

// Tuned so a well-played game escapes around round 8 (cap is 12)
export const JOBS: JobDef[] = [
  { id: 'driver',  emoji: '🚚', name: 'Delivery Driver', salary: 600,  expenses: 380 },
  { id: 'shop',    emoji: '🛒', name: 'Shop Assistant',  salary: 750,  expenses: 470 },
  { id: 'teacher', emoji: '📚', name: 'Teacher',         salary: 900,  expenses: 560 },
  { id: 'trade',   emoji: '🔧', name: 'Tradesperson',    salary: 1050, expenses: 650 },
]

export const DEGREE_JOBS: JobDef[] = [
  { id: 'accountant', emoji: '📊', name: 'Accountant', salary: 1400, expenses: 850  },
  { id: 'engineer',   emoji: '⚙️', name: 'Engineer',   salary: 1700, expenses: 1000 },
]

export const ASSETS: AssetDef[] = [
  { id: 'lemon',    emoji: '🍋', name: 'Lemonade Stand',     tier: 1, cost: 700,  income: 90  },
  { id: 'park',     emoji: '🅿️', name: 'Parking Spot',        tier: 1, cost: 1100, income: 140 },
  { id: 'truck',    emoji: '🚚', name: 'Food Truck',          tier: 1, cost: 1500, income: 190 },
  { id: 'stocks',   emoji: '📈', name: 'Stocks',              tier: 2, cost: 2000, income: 260, isStock: true, volatile: true },
  { id: 'property', emoji: '🏠', name: 'Investment Property', tier: 2, cost: 2400, income: 320, isProperty: true },
  { id: 'biz',      emoji: '🏪', name: 'Small Business',      tier: 2, cost: 3800, income: 480, isBusiness: true },
  { id: 'startup',  emoji: '💡', name: 'Tech Startup',        tier: 2, cost: 2800, income: 460, isBusiness: true, degreeOnly: true },
  { id: 'hotel',    emoji: '🏨', name: 'Hotel',               tier: 3, cost: 4500, income: 950, requiresProperties: 3 },
]

// 6 segments — probability: event 33%, chance 33%, mini-game 17%, big-event 17%
export const REEL_SEGMENTS: ReelSegment[] = ['event', 'event', 'chance', 'chance', 'mini-game', 'big-event']

export const REFLEX_GAMES: ReflexGameId[] = ['coin-rain', 'lemon-squeeze', 'cash-grab', 'pet-rush']

// ─── Trivia (reused from original game) ─────────────────────────────────────

export interface TriviaQuestion {
  id: string
  question: string
  options: string[]
  correctIndex: number
}

export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  { id: 'q1',  question: 'If you earn $200 and spend $140, what is your profit?',                         options: ['$60', '$40', '$340', '$80'],                                                       correctIndex: 0 },
  { id: 'q2',  question: 'What do we call money a property earns for its owner?',                          options: ['Profit', 'Salary', 'Rent', 'Tax'],                                                 correctIndex: 2 },
  { id: 'q3',  question: 'A mortgage is:',                                                                  options: ['Free money', 'A loan to buy property', 'A type of business', 'Extra salary'],     correctIndex: 1 },
  { id: 'q4',  question: 'Passive income means money you earn:',                                            options: ['From working', 'While you sleep', 'Only on weekends', 'From taxes'],              correctIndex: 1 },
  { id: 'q5',  question: 'Assets are things that:',                                                         options: ['Cost you money', 'Put money in your pocket', 'Are always expensive', 'Banks own'], correctIndex: 1 },
  { id: 'q6',  question: 'If you borrow money, what do you call the extra you pay back?',                  options: ['Rent', 'Tax', 'Interest', 'Salary'],                                               correctIndex: 2 },
  { id: 'q7',  question: 'Which is a liability (something that costs you money)?',                         options: ['Business', 'Savings', 'Mortgage debt', 'Salary'],                                  correctIndex: 2 },
  { id: 'q8',  question: 'What does it mean to invest?',                                                   options: ['Spend all your money', 'Put money somewhere to grow', 'Give money away', 'Borrow money'], correctIndex: 1 },
  { id: 'q9',  question: 'A lemonade stand is an example of:',                                             options: ['A liability', 'A salary', 'An asset', 'An expense'],                              correctIndex: 2 },
  { id: 'q10', question: 'If rent is $120 and mortgage interest is $40, what is your net income?',        options: ['$160', '$80', '$40', '$120'],                                                      correctIndex: 1 },
  { id: 'q11', question: 'What is a "down payment"?',                                                      options: ['Monthly salary', 'Part of a purchase price paid upfront', 'Bank fee', 'Monthly rent'], correctIndex: 1 },
  { id: 'q12', question: 'Which comes first: earning or spending to build wealth?',                        options: ['Spending first', 'They are the same', 'Earning first', 'Borrowing first'],        correctIndex: 2 },
  { id: 'q13', question: 'What does "profit" mean?',                                                       options: ['Money you borrow', 'Money earned minus money spent', 'Total money earned', 'Money in the bank'], correctIndex: 1 },
  { id: 'q14', question: 'Which is passive income?',                                                       options: ['Salary from a job', 'Rent from a property', 'Spending savings', 'Borrowing money'], correctIndex: 1 },
  { id: 'q15', question: 'If you have $300 and spend $80, how much is left?',                             options: ['$380', '$220', '$240', '$200'],                                                    correctIndex: 1 },
  { id: 'q16', question: 'What is the "Rat Race"?',                                                        options: ['A game with rats', 'Working just to pay expenses with nothing left over', 'A car race', 'A type of business'], correctIndex: 1 },
  { id: 'q17', question: 'Which costs MORE upfront: buying outright or mortgage?',                         options: ['Mortgage', 'Buying outright', 'They cost the same', 'Neither costs money'],       correctIndex: 1 },
  { id: 'q18', question: 'What is a budget?',                                                              options: ['A type of loan', 'A plan for how to spend and save money', 'A business name', 'A tax form'], correctIndex: 1 },
  { id: 'q19', question: 'If your passive income is $160 and expenses are $160, what happens?',           options: ['You lose the game', 'You win — you escaped the Rat Race!', 'Nothing changes', 'You must pay tax'], correctIndex: 1 },
  { id: 'q20', question: 'Why is passive income powerful?',                                                options: ['It requires more work', 'You earn it even when not working', 'It is always illegal', 'Banks give it to you free'], correctIndex: 1 },
]
