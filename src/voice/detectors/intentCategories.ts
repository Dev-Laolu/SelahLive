import type { BuiltInIntentCategory } from './type';

export const BUILT_IN_INTENT_CATEGORIES: BuiltInIntentCategory[] = [
  {
    id: 'intent-offering',
    label: 'Offering & Tithes',
    matchKeywords: ['offering', 'tithe', 'tithes', 'giving', 'give', 'seed'],
    phrases: [
      'offering time',
      'time for offering',
      'receive the offering',
      'take up the offering',
      'receive our offering',
      'bring your offering',
      'bring our tithes',
      'tithes and offerings',
      'tithe and offering',
      'time to give',
      'give online',
      'giving time',
    ],
  },
  {
    id: 'intent-welcome',
    label: 'Welcome & Visitors',
    matchKeywords: ['welcome', 'visitor', 'visitors', 'guest', 'first time'],
    phrases: [
      'welcome to church',
      'welcome home',
      'first time visitors',
      'first time guests',
      'visiting with us today',
      'glad you joined us',
      'welcome everyone',
    ],
  },
  {
    id: 'intent-prayer',
    label: 'Prayer Moment',
    matchKeywords: ['prayer', 'pray', 'intercession'],
    phrases: [
      'let us pray',
      'lets pray together',
      'bow our heads',
      'bow your heads',
      'lift our hearts in prayer',
      'go to the lord in prayer',
      'time of prayer',
    ],
  },
  {
    id: 'intent-announcements',
    label: 'Announcements',
    matchKeywords: ['announcement', 'announcements', 'events', 'notice', 'news'],
    phrases: [
      'church announcements',
      'weekly announcements',
      'few announcements',
      'upcoming events',
      'listen to the announcements',
    ],
  },
  {
    id: 'intent-thanks',
    label: 'Thank You / Dismissal',
    matchKeywords: ['thank you', 'thanks', 'dismissal', 'benediction', 'goodbye'],
    phrases: [
      'thank you for joining us',
      'thanks for worshipping with us',
      'have a blessed week',
      'service is dismissed',
    ],
  },
];
