import type { Course } from "@/lib/courses/types";

// Original, kid-friendly lessons inspired by the people-skills ideas in
// "How to Win Friends and Influence People" (Dale Carnegie). Wording is our own.

export const HOW_TO_WIN_FRIENDS: Course = {
  id: "how-to-win-friends",
  title: "How to Win Friends",
  subtitle: "Be a kind, friendly superstar",
  emoji: "🤝",
  about:
    "Six short lessons on making friends and being someone people love to be around. Read each one, then pass the quiz to earn stars!",
  passPct: 0.75,
  lessons: [
    {
      id: "smile",
      title: "Start With a Smile",
      emoji: "🙂",
      summary: "A smile is the friendliest hello.",
      starReward: 5,
      reading: [
        { heading: "A smile says hello", body: "A smile is the easiest way to make someone feel happy and safe. It tells people “I'm glad to see you!” before you even say a word." },
        { heading: "It bounces back", body: "When you smile at someone, they usually smile right back. Friendly feelings bounce between people like a ball." },
        { heading: "Try it out", body: "When you walk into class and smile at someone sitting alone, they feel welcome — and you might just make a new friend." },
      ],
      tryIt: "Give a real smile to three people today: someone at home, someone at school, and someone you don't know well.",
      quiz: [
        { q: "What does a smile tell other people?", options: ["I'm glad to see you!", "Go away", "I'm bored", "Nothing at all"], answer: 0 },
        { q: "What usually happens when you smile at someone?", options: ["They smile back", "They run away", "They get angry", "They fall asleep"], answer: 0 },
        { q: "A great time to smile is...", options: ["When you greet someone", "Never", "Only on your birthday", "Only when you win"], answer: 0 },
        { q: "A smile works best when it is...", options: ["Honest and friendly", "Fake", "Mean", "Hidden"], answer: 0 },
      ],
    },
    {
      id: "names",
      title: "Remember Names",
      emoji: "📛",
      summary: "A person's name is their favourite sound.",
      starReward: 5,
      reading: [
        { heading: "The sweetest sound", body: "To each person, their own name is one of the nicest words to hear. Using someone's name shows you really see them." },
        { heading: "How to remember", body: "When you meet someone, say their name back: “Nice to meet you, Sam!” Picture it in your head, then use it again before you say goodbye." },
        { heading: "It feels warm", body: "Saying “Thanks, Maria!” feels much warmer than just “thanks.”" },
      ],
      tryIt: "Learn one new person's name today and use it twice while you chat.",
      quiz: [
        { q: "To most people, their own name is...", options: ["One of their favourite sounds", "Boring", "Annoying", "A secret"], answer: 0 },
        { q: "A good trick to remember a name is to...", options: ["Say it back when you meet them", "Forget it quickly", "Write it on a wall", "Never use it"], answer: 0 },
        { q: "Using someone's name shows that you...", options: ["Really notice them", "Are ignoring them", "Are tired", "Don't care"], answer: 0 },
        { q: "Which sounds warmer?", options: ["“Thanks, Maria!”", "“Thanks.”", "“Hey you.”", "“Whatever.”"], answer: 0 },
      ],
    },
    {
      id: "listen",
      title: "Be a Super Listener",
      emoji: "👂",
      summary: "Let others talk and really listen.",
      starReward: 5,
      reading: [
        { heading: "Listening is a gift", body: "People love to be heard. When you listen carefully, you make others feel important." },
        { heading: "How to listen well", body: "Look at them, don't interrupt, and ask questions about what they said. Let them finish their story." },
        { heading: "Ask, don't grab", body: "If your friend is excited about their dog, ask “What's its name? What tricks can it do?” instead of jumping in to talk about yourself." },
      ],
      tryIt: "In your next chat, ask two questions before you talk about yourself.",
      quiz: [
        { q: "Good listeners make others feel...", options: ["Important and heard", "Ignored", "Silly", "Scared"], answer: 0 },
        { q: "A great way to listen is to...", options: ["Ask about what they said", "Interrupt a lot", "Look at your shoes", "Change the subject"], answer: 0 },
        { q: "When someone is telling a story you should...", options: ["Let them finish", "Talk over them", "Walk away", "Check the time"], answer: 0 },
        { q: "Asking questions shows you are...", options: ["Interested", "Bored", "Rude", "Asleep"], answer: 0 },
      ],
    },
    {
      id: "compliments",
      title: "Give Real Compliments",
      emoji: "🌟",
      summary: "Honest praise makes someone's day.",
      starReward: 5,
      reading: [
        { heading: "Honest praise", body: "Everyone loves to feel appreciated. A true compliment can make someone's whole day better." },
        { heading: "Be specific and honest", body: "Say what you really mean. “You explained that so clearly!” is better than fake flattery like “you're the best ever.”" },
        { heading: "It helps them grow", body: "Telling a teammate “Great pass!” helps them feel proud and want to play even better." },
      ],
      tryIt: "Give two honest compliments today — and really mean them.",
      quiz: [
        { q: "A real compliment should be...", options: ["Honest and specific", "Fake", "Mean", "A secret"], answer: 0 },
        { q: "Honest appreciation makes people feel...", options: ["Proud and happy", "Embarrassed", "Angry", "Invisible"], answer: 0 },
        { q: "Which is a better compliment?", options: ["“You explained that really clearly!”", "“You're okay I guess”", "“Whatever”", "“That was bad”"], answer: 0 },
        { q: "Fake praise (flattery) is...", options: ["Not as good as honest praise", "Always best", "Kind", "Required"], answer: 0 },
      ],
    },
    {
      id: "their-way",
      title: "See It Their Way",
      emoji: "🪞",
      summary: "Care about what others care about.",
      starReward: 5,
      reading: [
        { heading: "Talk about what they like", body: "People enjoy talking about their own interests. Ask about the things they care about." },
        { heading: "Stand in their shoes", body: "Before you ask for something, think about how the other person feels. It helps you be kind and fair." },
        { heading: "Make it a win for both", body: "If you want your little brother to help tidy up, talk about how fun it'll be to find his toys after — not just what you want." },
      ],
      tryIt: "Ask someone about their favourite hobby today, and really listen to the answer.",
      quiz: [
        { q: "People most enjoy talking about...", options: ["Things they care about", "Your homework", "Boring rules", "Nothing"], answer: 0 },
        { q: "“Standing in their shoes” means...", options: ["Imagining how they feel", "Taking their shoes", "Being taller", "Running away"], answer: 0 },
        { q: "To get help from someone, it helps to...", options: ["Show how it's good for them too", "Demand it", "Yell", "Trick them"], answer: 0 },
        { q: "Showing interest in others makes them...", options: ["Enjoy talking with you", "Avoid you", "Feel sad", "Confused"], answer: 0 },
      ],
    },
    {
      id: "be-kind",
      title: "Be Kind, Not Critical",
      emoji: "🕊️",
      summary: "Skip put-downs; admit mistakes; stay calm.",
      starReward: 5,
      reading: [
        { heading: "Skip the criticism", body: "Putting people down makes them feel bad and want to argue. Being kind helps them want to listen to you." },
        { heading: "Admit mistakes fast", body: "If you're wrong, say so quickly and kindly. It's brave, and people respect it." },
        { heading: "Stay friendly when you disagree", body: "You can disagree without being mean. Instead of “You did it wrong!” try “Want to try it together?”" },
      ],
      tryIt: "If you make a mistake today, admit it quickly and kindly.",
      quiz: [
        { q: "Criticising people usually makes them...", options: ["Want to argue", "Happy", "Calm", "Grateful"], answer: 0 },
        { q: "When you're wrong, the brave thing is to...", options: ["Admit it quickly and kindly", "Hide it", "Blame others", "Get angry"], answer: 0 },
        { q: "In a disagreement you should...", options: ["Stay calm and friendly", "Shout", "Call names", "Storm off"], answer: 0 },
        { q: "Which is kinder?", options: ["“Want to try it together?”", "“You did it wrong!”", "“You're hopeless”", "“Move over”"], answer: 0 },
      ],
    },
  ],
};
