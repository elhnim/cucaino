// components/onboarding/tourSteps.ts

export interface TourStep {
  route: string;
  label: string;
  description: string;
}

export const PARENT_TOUR_STEPS: TourStep[] = [
  {
    route: "/parent",
    label: "📊 Overview",
    description:
      "Your daily snapshot — see which kids have completed tasks and the family star balance at a glance.",
  },
  {
    route: "/parent/tasks",
    label: "✅ Tasks",
    description:
      "Create and schedule tasks for your kids. Assign points, set a time block, and they appear on each kid's daily list.",
  },
  {
    route: "/parent/rewards",
    label: "🎁 Rewards",
    description:
      "Set up what kids can earn with their stars. You control what's available and whether it needs your approval.",
  },
  {
    route: "/parent/requests",
    label: "🔔 Requests",
    description:
      "When a kid claims a reward that needs approval, it shows up here. Approve or deny with one tap.",
  },
  {
    route: "/parent/settings",
    label: "⚙️ Settings",
    description:
      "Manage your kids' profiles, set a parent PIN, and customise your family's setup.",
  },
];

export function kidTourSteps(kidId: string): TourStep[] {
  return [
    {
      route: `/kid/${kidId}/home`,
      label: "🏠 Home",
      description:
        "See your stars, streaks, and today's progress. This is your command centre!",
    },
    {
      route: `/kid/${kidId}/todo`,
      label: "📋 Schedule",
      description:
        "Your daily tasks live here. Tick them off to earn stars — try to get them all done!",
    },
    {
      route: `/kid/${kidId}/rewards`,
      label: "🎁 Store",
      description:
        "Spend your stars on rewards. Save up for the big ones or grab something small today.",
    },
    {
      route: `/play?kid=${kidId}`,
      label: "🎮 Play",
      description:
        "Quiz time! Answer questions, beat your score, and earn bonus stars.",
    },
    {
      route: `/kid/${kidId}/friends`,
      label: "👫 Friends",
      description:
        "Add friends from other families using their @username. See their requests here and connect!",
    },
  ];
}
