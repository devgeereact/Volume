import type { MarketingPack } from "./types";

/* Launch content for The New Charge Nurse, the demo book that is written and in editing (Handover is
   still being written, so it has no launch content yet). No invented statistics, reviews or
   testimonials; the review request asks for an honest review and offers nothing. */

export const chargeNurseMarketing: MarketingPack = {
  bookId: "the-new-charge-nurse",
  tiktok: [
    {
      id: "cn-tt-1",
      hook: "Nobody feels ready for the keys.",
      beats: [
        "Hold up a set of ward keys. Say: this is what 07:30 feels like on your first shift in charge.",
        "Name the three things to look at first: the board, the sickest patient, the newest member of staff.",
        "Close: chapter 1 walks through that first shift hour by hour.",
      ],
      onScreenText: ["First shift in charge", "Board. Sickest patient. Newest staff."],
      caption: "For every nurse handed the keys before they felt ready. The New Charge Nurse by Harni Muharami.",
      hashtags: ["#nursing", "#NHS", "#chargenurse", "#nursetok"],
      lengthSeconds: 30,
    },
    {
      id: "cn-tt-2",
      hook: "Fair is not the same as equal.",
      beats: [
        "Show an allocation board with every nurse given the same number of patients.",
        "Point out the bay with two unwell patients and a student.",
        "Say why you would change it, out loud, the way chapter 3 suggests.",
      ],
      onScreenText: ["Equal", "Fair", "Say why"],
      caption: "Allocation is the first decision everyone sees you make. Chapter 3 of The New Charge Nurse.",
      hashtags: ["#nursing", "#leadership", "#NHS"],
      lengthSeconds: 35,
    },
  ],
  instagram: [
    {
      id: "cn-ig-1",
      caption:
        "Protect one break a shift as if it were a patient's medication. Hand over the keys, leave the ward and eat something that is not from a vending machine.",
      hashtags: ["#nurselife", "#chargenurse", "#NHS", "#nursewellbeing"],
      imageIdea: "The line set in the cover's typeface on its amber and navy, with the cover in the corner.",
    },
    {
      id: "cn-ig-2",
      caption: "A good safety huddle takes five minutes. End it with one question: is there anything anyone needs from me before we start?",
      hashtags: ["#patientsafety", "#nursing", "#chargenurse"],
      imageIdea: "A plain card with the question, in the book's colours.",
    },
  ],
  email: [
    {
      id: "cn-em-1",
      subject: "My book for your first year in charge",
      preview: "What I learnt on the floor in my first year leading a shift, written down so you do not have to learn it the hard way.",
      body: [
        "Hello,",
        "The New Charge Nurse: Your First Year Leading a Shift is now out.",
        "It is the book I wanted in my first year in charge: the first shift with the keys, fair allocation, escalating without apology, handling conflict on the floor and looking after yourself.",
        "If it helps you, an honest review on Amazon helps other nurses find it.",
        "Harni",
      ],
    },
  ],
};
