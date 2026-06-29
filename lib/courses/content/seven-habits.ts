import type { Course } from "@/lib/courses/types";

// Original, kid-friendly lessons inspired by "The 7 Habits of Happy Kids"
// (Sean Covey). Wording is our own.

export const SEVEN_HABITS: Course = {
  id: "seven-habits",
  title: "7 Habits of Happy Kids",
  subtitle: "Seven habits to be your best",
  emoji: "🦉",
  about:
    "Seven famous habits that help kids be happy, kind, and awesome. Read each lesson, pass the quiz, and earn ⭐ stars!",
  passPct: 0.75,
  lessons: [
    {
      id: "be-proactive",
      title: "Be Proactive",
      emoji: "🚀",
      summary: "You're in charge of you.",
      starReward: 5,
      reading: [
        { heading: "You choose", body: "Being proactive means YOU decide how to act, instead of blaming others or your mood. You hold the steering wheel of your own day." },
        { heading: "Pause, then choose", body: "When something annoying happens, take a breath and choose a good response instead of just reacting." },
        { heading: "Try it out", body: "If your tower of blocks falls over, a proactive kid takes a breath and rebuilds it, instead of yelling or giving up." },
      ],
      tryIt: "Next time you feel upset, take one deep breath before you do anything.",
      quiz: [
        { q: "Being proactive means...", options: ["You choose how to act", "You blame others", "You give up", "You wait for luck"], answer: 0 },
        { q: "When something annoying happens, a proactive kid...", options: ["Takes a breath and chooses a good response", "Yells right away", "Blames a friend", "Quits"], answer: 0 },
        { q: "Who is in charge of how you act?", options: ["You", "Your mood", "Other people", "The weather"], answer: 0 },
        { q: "If your blocks fall, the proactive thing is to...", options: ["Calmly rebuild", "Scream", "Blame someone", "Never play again"], answer: 0 },
      ],
    },
    {
      id: "end-in-mind",
      title: "Begin With the End in Mind",
      emoji: "🎯",
      summary: "Have a plan before you start.",
      starReward: 5,
      reading: [
        { heading: "Picture the finish", body: "Before you start, imagine how you want things to end up. A picture in your head helps you get there." },
        { heading: "Make a goal", body: "Decide what you want, then take small steps toward it." },
        { heading: "Try it out", body: "Before building a sandcastle, picture what it'll look like — then you know exactly what to build." },
      ],
      tryIt: "Pick one thing you want to do today and picture it finished before you start.",
      quiz: [
        { q: "“Begin with the end in mind” means...", options: ["Picture how you want it to end, then plan", "Start with no plan", "Copy others", "Give up early"], answer: 0 },
        { q: "A plan helps you...", options: ["Reach your goal", "Get lost", "Waste time", "Forget"], answer: 0 },
        { q: "Before building a sandcastle you should...", options: ["Picture what it'll look like", "Knock it down", "Close your eyes", "Run away"], answer: 0 },
        { q: "A goal is...", options: ["Something you want and aim for", "A kind of food", "A mistake", "A nap"], answer: 0 },
      ],
    },
    {
      id: "first-things-first",
      title: "Put First Things First",
      emoji: "✅",
      summary: "Work first, then play.",
      starReward: 5,
      reading: [
        { heading: "Important things first", body: "Do the most important jobs before the fun stuff. Then you can play with no worries." },
        { heading: "Beat the rush", body: "Don't leave things to the last minute. A little work now saves a big rush later." },
        { heading: "Try it out", body: "Doing your homework before screen time means you can relax and really enjoy it." },
      ],
      tryIt: "Today, finish one important job before you play.",
      quiz: [
        { q: "“Put first things first” means...", options: ["Do important things before fun", "Play all day", "Skip your jobs", "Do everything last"], answer: 0 },
        { q: "Doing work before play helps you...", options: ["Relax and enjoy play", "Feel more stressed", "Forget your jobs", "Stay up late"], answer: 0 },
        { q: "Leaving things to the last minute causes...", options: ["A big rush", "More fun", "Better sleep", "Nothing"], answer: 0 },
        { q: "Which comes first?", options: ["Homework, then screen time", "Screen time, then never homework", "Only play", "Only worry"], answer: 0 },
      ],
    },
    {
      id: "win-win",
      title: "Think Win-Win",
      emoji: "🤝",
      summary: "Everyone can win.",
      starReward: 5,
      reading: [
        { heading: "Both can be happy", body: "Win-win means finding a way that works for you AND the other person. Nobody has to lose." },
        { heading: "Share and take turns", body: "Look for fair solutions where everyone feels good." },
        { heading: "Try it out", body: "If two of you want the last cookie, a win-win could be sharing it in half." },
      ],
      tryIt: "Solve one disagreement today so both people feel happy.",
      quiz: [
        { q: "Win-win means...", options: ["Both people win", "Only you win", "Only they win", "Everyone loses"], answer: 0 },
        { q: "A win-win for the last cookie could be...", options: ["Sharing it in half", "Grabbing it all", "Throwing it away", "Hiding it"], answer: 0 },
        { q: "Thinking win-win helps you...", options: ["Be fair and kind", "Be selfish", "Argue more", "Lose friends"], answer: 0 },
        { q: "In win-win, who has to lose?", options: ["Nobody", "You", "Them", "Everybody"], answer: 0 },
      ],
    },
    {
      id: "understand-first",
      title: "Listen First",
      emoji: "👂",
      summary: "Understand others before you're understood.",
      starReward: 5,
      reading: [
        { heading: "Listen before you talk", body: "Try to really understand the other person before you explain your own side." },
        { heading: "Understand their feelings", body: "When people feel understood, they listen to you too." },
        { heading: "Try it out", body: "If a friend is upset, ask how they feel before telling them what you think." },
      ],
      tryIt: "Before sharing your idea today, listen carefully to someone else's first.",
      quiz: [
        { q: "“Seek first to understand” means...", options: ["Listen before you talk", "Talk first always", "Ignore others", "Interrupt"], answer: 0 },
        { q: "When people feel understood, they...", options: ["Listen to you too", "Walk away", "Get angrier", "Stop talking forever"], answer: 0 },
        { q: "If a friend is upset, first you should...", options: ["Ask how they feel", "Tell them they're wrong", "Change the subject", "Laugh"], answer: 0 },
        { q: "Understanding others helps you...", options: ["Get along better", "Argue more", "Feel bored", "Be unfair"], answer: 0 },
      ],
    },
    {
      id: "synergize",
      title: "Synergize",
      emoji: "✨",
      summary: "Together is better.",
      starReward: 5,
      reading: [
        { heading: "Teamwork wins", body: "Synergize means working together so the team is better than any one person alone." },
        { heading: "Mix your strengths", body: "Everyone is good at different things. Together you can do amazing stuff." },
        { heading: "Try it out", body: "One kid draws, one kid writes — together they make a great comic!" },
      ],
      tryIt: "Work with someone today and use both of your strengths.",
      quiz: [
        { q: "Synergize means...", options: ["Working together to do better", "Working alone", "Bossing others", "Quitting"], answer: 0 },
        { q: "Teamwork works because everyone...", options: ["Is good at different things", "Is exactly the same", "Is the best", "Does nothing"], answer: 0 },
        { q: "One kid draws and one writes — together they...", options: ["Make a great comic", "Make nothing", "Argue", "Get worse"], answer: 0 },
        { q: "Together a team can be...", options: ["Better than one person alone", "Always worse", "Slower at everything", "Bored"], answer: 0 },
      ],
    },
    {
      id: "sharpen-the-saw",
      title: "Sharpen the Saw",
      emoji: "🌳",
      summary: "Take care of you.",
      starReward: 5,
      reading: [
        { heading: "Keep yourself strong", body: "Sharpen the saw means looking after your body, brain, and heart so you stay your best." },
        { heading: "Balance is best", body: "Eat well, move, rest, learn, and spend time with people you love." },
        { heading: "Try it out", body: "Sleeping well and playing outside helps your brain and body work better." },
      ],
      tryIt: "Do one thing today that's good for your body and one that's good for your mind.",
      quiz: [
        { q: "“Sharpen the saw” means...", options: ["Take care of yourself", "Cut wood", "Work non-stop", "Never rest"], answer: 0 },
        { q: "To stay your best, care for your...", options: ["Body, brain, and heart", "Only homework", "Only games", "Nothing"], answer: 0 },
        { q: "A balanced day includes...", options: ["Rest, food, moving, and learning", "Only screens", "Only sleep", "Only sweets"], answer: 0 },
        { q: "Sleeping well helps your...", options: ["Brain and body", "Shoes", "Toys", "TV"], answer: 0 },
      ],
    },
  ],
};
