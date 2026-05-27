"use client";

import { useState } from "react";
import { markFriendsFeatureSeen } from "@/lib/actions/onboarding";

export function FriendsFeatureCard({
  kidId,
  accent,
}: {
  kidId: string;
  accent: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = async () => {
    setDismissed(true);
    await markFriendsFeatureSeen(kidId);
  };

  if (dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
        <div className="text-5xl">👫</div>
        <h2 className="text-xl font-black text-gray-900">Friends is here!</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          You can now add friends from other families using their{" "}
          <span className="font-bold">@username</span>. Find them in the new{" "}
          <span className="font-bold">Friends</span> tab at the bottom.
        </p>
        <ul className="text-left text-sm text-gray-600 space-y-1.5 px-2">
          <li>✅ Search by @username</li>
          <li>✅ Send & accept friend requests</li>
          <li>✅ See a notification when someone adds you</li>
        </ul>
        <button
          type="button"
          onClick={handleDismiss}
          className="w-full text-white font-black py-3 rounded-2xl text-base mt-2"
          style={{ background: accent }}
        >
          Got it! 🎉
        </button>
      </div>
    </div>
  );
}
