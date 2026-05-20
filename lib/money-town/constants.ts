import type { Job, Asset, ExpenseEvent, BadLuckEvent, TriviaQuestion, WheelSegment } from './types'

export const STARTING_CASH = 500

export const PLAYER_COLORS = ['red', 'blue', 'green', 'yellow'] as const

export const PLAYER_COLOR_CLASSES: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  red:    { bg: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-800',    badge: 'bg-red-500'    },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-300',   text: 'text-blue-800',   badge: 'bg-blue-500'   },
  green:  { bg: 'bg-green-50',  border: 'border-green-300',  text: 'text-green-800',  badge: 'bg-green-500'  },
  yellow: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800', badge: 'bg-yellow-500' },
}

export const JOBS: Job[] = [
  { id: 'artist',   emoji: '🎨', name: 'Artist',   salary: 150, expenses: 120 },
  { id: 'chef',     emoji: '👩‍🍳', name: 'Chef',     salary: 200, expenses: 160 },
  { id: 'mechanic', emoji: '🔧', name: 'Mechanic', salary: 250, expenses: 200 },
  { id: 'coder',    emoji: '👩‍💻', name: 'Coder',    salary: 300, expenses: 240 },
]

export const ASSETS: Asset[] = [
  // Tier 1 — Kid Businesses
  { id: 'lemonade',   emoji: '🍋', name: 'Lemonade Stand',  type: 'business', tier: 1, cost: 200,  incomePerRound: 30  },
  { id: 'bake-sale',  emoji: '🧁', name: 'Bake Sale',       type: 'business', tier: 1, cost: 250,  incomePerRound: 40  },
  { id: 'pet-sit',    emoji: '🐾', name: 'Pet Sitting',     type: 'business', tier: 1, cost: 300,  incomePerRound: 50  },
  { id: 'lawn',       emoji: '🌿', name: 'Lawn Mowing',     type: 'business', tier: 1, cost: 400,  incomePerRound: 60  },
  { id: 'car-wash',   emoji: '🚗', name: 'Car Wash',        type: 'business', tier: 1, cost: 500,  incomePerRound: 80  },
  // Tier 2 — Dream Businesses
  { id: 'pizza',      emoji: '🍕', name: 'Pizza Restaurant', type: 'business', tier: 2, cost: 1500, incomePerRound: 200 },
  { id: 'toy-store',  emoji: '🧸', name: 'Toy Store',       type: 'business', tier: 2, cost: 2000, incomePerRound: 250 },
  { id: 'mini-golf',  emoji: '⛳', name: 'Mini-Golf Course', type: 'business', tier: 2, cost: 2500, incomePerRound: 300 },
  { id: 'cinema',     emoji: '🎬', name: 'Movie Theatre',   type: 'business', tier: 2, cost: 3000, incomePerRound: 400 },
  { id: 'theme-park', emoji: '🎡', name: 'Theme Park',      type: 'business', tier: 2, cost: 5000, incomePerRound: 600 },
  // Tier 3 — Properties
  { id: 'beach-house',   emoji: '🏠', name: 'Beach House',       type: 'property', tier: 3, cost: 1000, incomePerRound: 120 },
  { id: 'apartment',     emoji: '🏢', name: 'City Apartment',    type: 'property', tier: 3, cost: 1800, incomePerRound: 220 },
  { id: 'corner-shop',   emoji: '🏪', name: 'Corner Shop',       type: 'property', tier: 3, cost: 2200, incomePerRound: 280 },
  { id: 'mall-unit',     emoji: '🏬', name: 'Shopping Mall Unit', type: 'property', tier: 3, cost: 3500, incomePerRound: 450 },
  { id: 'hotel',         emoji: '🏨', name: 'Hotel',             type: 'property', tier: 3, cost: 6000, incomePerRound: 750 },
]

// 10 segments: 3x payday, 2x deal, 2x expense, 2x minigame, 1x bad-luck
export const WHEEL_SEGMENTS: WheelSegment[] = [
  'payday', 'payday', 'payday',
  'deal', 'deal',
  'expense', 'expense',
  'minigame', 'minigame',
  'bad-luck',
]

export const EXPENSE_EVENTS: ExpenseEvent[] = [
  { id: 'school',   emoji: '🎒', description: 'School supplies',                  cost: 50 },
  { id: 'game',     emoji: '🎮', description: "New video game (couldn't resist!)", cost: 80 },
  { id: 'birthday', emoji: '🎂', description: 'Birthday party',                   cost: 60 },
  { id: 'pizza',    emoji: '🍕', description: 'Pizza night',                       cost: 40 },
  { id: 'sneakers', emoji: '👟', description: 'New sneakers',                      cost: 70 },
]

export const BAD_LUCK_EVENTS: BadLuckEvent[] = [
  { id: 'doctor',  emoji: '🚑', description: 'Doctor visit',                                             type: 'flat',            amount: 100 },
  { id: 'rain',    emoji: '🌧️', description: 'Rainy week — one business earns nothing next round',       type: 'business-skip',   amount: 0   },
  { id: 'repairs', emoji: '🔧', description: 'Property repairs needed',                                  type: 'property-repair', amount: 0   },
  { id: 'friend',  emoji: '💔', description: 'Friend borrowed money',                                    type: 'friend',          amount: 75  },
  { id: 'bug',     emoji: '🐛', description: 'Bug infestation!',                                         type: 'cash',            amount: 150 },
]

export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  { id: 'q1',  question: 'If you earn $200 and spend $140, what is your profit?',         options: ['$60', '$40', '$340', '$80'],                                                      correctIndex: 0 },
  { id: 'q2',  question: 'What do we call money a property earns for its owner?',          options: ['Profit', 'Salary', 'Rent', 'Tax'],                                                correctIndex: 2 },
  { id: 'q3',  question: 'A mortgage is:',                                                  options: ['Free money', 'A loan to buy property', 'A type of business', 'Extra salary'],    correctIndex: 1 },
  { id: 'q4',  question: 'Passive income means money you earn:',                            options: ['From working', 'While you sleep', 'Only on weekends', 'From taxes'],             correctIndex: 1 },
  { id: 'q5',  question: 'Assets are things that:',                                         options: ['Cost you money', 'Put money in your pocket', 'Are always expensive', 'Banks own'], correctIndex: 1 },
  { id: 'q6',  question: 'If you borrow money, what do you call the extra you pay back?',  options: ['Rent', 'Tax', 'Interest', 'Salary'],                                              correctIndex: 2 },
  { id: 'q7',  question: 'Which is a liability (something that costs you money)?',         options: ['Business', 'Savings', 'Mortgage debt', 'Salary'],                                correctIndex: 2 },
  { id: 'q8',  question: 'What does it mean to invest?',                                   options: ['Spend all your money', 'Put money somewhere to grow', 'Give money away', 'Borrow money'], correctIndex: 1 },
  { id: 'q9',  question: 'A lemonade stand is an example of:',                             options: ['A liability', 'A salary', 'An asset', 'An expense'],                             correctIndex: 2 },
  { id: 'q10', question: 'If rent is $120 and mortgage interest is $40, what is your net income?', options: ['$160', '$80', '$40', '$120'],                                             correctIndex: 1 },
  { id: 'q11', question: 'What is a "down payment"?',                                      options: ['Monthly salary', 'Part of a purchase price paid upfront', 'Bank fee', 'Monthly rent'], correctIndex: 1 },
  { id: 'q12', question: 'Which comes first: earning or spending to build wealth?',        options: ['Spending first', 'They are the same', 'Earning first', 'Borrowing first'],       correctIndex: 2 },
  { id: 'q13', question: 'What does "profit" mean?',                                       options: ['Money you borrow', 'Money earned minus money spent', 'Total money earned', 'Money in the bank'], correctIndex: 1 },
  { id: 'q14', question: 'Which is passive income?',                                       options: ['Salary from a job', 'Rent from a property', 'Spending savings', 'Borrowing money'], correctIndex: 1 },
  { id: 'q15', question: 'If you have $300 and spend $80, how much is left?',              options: ['$380', '$220', '$240', '$200'],                                                   correctIndex: 1 },
  { id: 'q16', question: 'What is the "Rat Race"?',                                        options: ['A game with rats', 'Working just to pay expenses with nothing left over', 'A car race', 'A type of business'], correctIndex: 1 },
  { id: 'q17', question: 'Which costs MORE upfront: buying outright or mortgage?',         options: ['Mortgage', 'Buying outright', 'They cost the same', 'Neither costs money'],      correctIndex: 1 },
  { id: 'q18', question: 'What is a budget?',                                              options: ['A type of loan', 'A plan for how to spend and save money', 'A business name', 'A tax form'], correctIndex: 1 },
  { id: 'q19', question: 'If your passive income is $160 and expenses are $160, what happens?', options: ['You lose the game', 'You win — you escaped the Rat Race!', 'Nothing changes', 'You must pay tax'], correctIndex: 1 },
  { id: 'q20', question: 'Why is passive income powerful?',                                options: ['It requires more work', 'You earn it even when not working', 'It is always illegal', 'Banks give it to you free'], correctIndex: 1 },
]

export const REFLEX_GAMES = ['coin-rain', 'lemon-squeeze', 'cash-grab', 'pet-rush'] as const
