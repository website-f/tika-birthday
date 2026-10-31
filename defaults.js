// Default card content. Everything here can be edited from /admin;
// saved edits live in data/content.json and are merged over these defaults.
module.exports = {
  herName: 'Nurul Atikah',
  nickname: 'Tika',
  fromName: 'Fitri',
  pageTitle: 'Happy Birthday Nurul Atikah 💖',

  // Link preview shown when the URL is shared (WhatsApp, IG, Telegram...).
  share: {
    title: 'Happy Birthday, Tika! 🎂💖',
    description: 'Psst… someone made you a little birthday surprise 🎁 Tap to unwrap it, sayang! 💕',
    image: '',
  },

  gate: {
    title: 'Psst… Tika!',
    subtitle: 'Someone made you a little something. Sound on 🔊',
    button: 'Tap to unwrap 🎁',
  },

  hero: {
    eyebrow: "It's officially your day",
    line: 'Happy Birthday',
    subtitle:
      "Today the whole internet is celebrating you (okay, mostly just me, but I'm very loud about it).",
  },

  metDate: '',
  stats: [
    { value: '1000', suffix: '+', label: 'times you made me smile' },
    { value: '100', suffix: '%', label: 'chance of cake today' },
    { value: '1', suffix: '', label: 'very lucky boyfriend' },
  ],

  cake: {
    candles: 5,
    title: 'Make a wish, birthday girl',
    hint: 'Tap every candle to blow it out 🌬️',
    done: "Wish received ✨ It's being processed by the universe. Estimated delivery: very soon.",
  },

  memories: {
    title: 'Us, a highlight reel',
    subtitle: 'Swipe through some of my favourite moments with you →',
    photos: [],
  },

  memes: {
    title: 'The Official Birthday Meme Committee',
    subtitle: 'has reviewed your birthday and has a few notes 🤡',
    items: [
      { src: '/memes/purrsday-cat.gif', caption: 'Happy Purrsday to the cutest human alive 🐱🎂' },
      { src: '/memes/so-excited.gif', caption: 'Me when I remembered today is YOUR day' },
      { src: '/memes/cake-on-fire.gif', caption: 'Me trying to fit all your candles on one cake 🔥' },
      { src: '/memes/getting-old-skeletons.gif', caption: 'Breaking news: you are one year older. Still illegally cute though.' },
      { src: '/memes/feeling-old.gif', caption: 'Your knees this morning: “we need to talk”' },
    ],
  },

  letter: {
    title: 'A little letter for you',
    gif: '/memes/teddy-hug.gif',
    body:
      "Happy birthday, my love 💖\n\nAnother year of you being in this world, and honestly the world is so lucky. I'm the luckiest of all though.\n\nThank you for every laugh, every late-night talk, and every time you made a normal day feel special just by being in it. You make me want to be better, and you make everything feel lighter.\n\nToday is all about you. I hope this year gives you everything you've been wishing for: good health, big wins, endless happiness, and a lot more adventures with me (you can't get rid of me 😝).\n\nI love you. Happy birthday, sayang.",
    signoff: 'Forever yours, Fitri',
  },

  reasons: {
    title: 'Reasons you’re my favourite person',
    subtitle: 'Tap a card to flip it',
    items: [
      { emoji: '😂', text: 'Your laugh fixes my worst days' },
      { emoji: '🗺️', text: 'You turn ordinary days into adventures' },
      { emoji: '🧠', text: 'You remember the tiniest things about me' },
      { emoji: '📱', text: 'You are my favourite notification' },
      { emoji: '🌸', text: 'You are beautiful without even trying' },
      { emoji: '🙃', text: 'You put up with all my nonsense' },
      { emoji: '🫂', text: 'Your hugs have actual healing powers' },
      { emoji: '💖', text: 'You are simply you, and that is my favourite' },
    ],
  },

  surprise: {
    title: 'Wait… one more thing',
    hint: 'Scratch the golden card 👆',
    reveal: 'You are officially invited on a date with me TOMORROW 💘',
  },

  programme: {
    title: 'The (tentative) plan',
    subtitle: 'Subject to change by the birthday girl 👑',
    dateLabel: 'tomorrow, Sunday 1 November',
    items: [
      { time: '12:00 PM', emoji: '🍜', title: 'Lunch at TRX: Donkai', desc: 'First stop, your favourite donburi. Come hungry!', place: 'Donkai The Exchange TRX' },
      { time: '2:00 PM', emoji: '👟', title: 'Shopping: your new New Balance', desc: 'Pick any pair you like. My treat 🎁', place: '' },
      { time: '4:00 PM', emoji: '🤫', title: 'Secret place hehe', desc: "Can't tell you yet… hehe 🤭", place: '' },
      { time: '7:00 PM', emoji: '🍽️', title: 'Hotel buffet dinner', desc: "Eat until we can't move 😋", place: '' },
      { time: '11:00 PM', emoji: '🏠', title: 'Balik?', desc: '…or not yet? 👀', place: '' },
    ],
  },

  rsvp: {
    question: 'So… will you go on a date with me tomorrow?',
    waitingGif: '/memes/yesss-please.gif',
    waitingCaption: 'Me waiting for your answer 🙏',
    yesLabel: 'YES! 💖',
    noLabel: 'No 🙄',
    foodTitle: 'What are you most excited for?',
    foodOptions: ['Donkai 🍜', 'New Balance 👟', 'Secret place 🤫', 'Buffet 🍽️', 'EVERYTHING 🥳'],
    vibeTitle: 'Outfit vibe?',
    vibeOptions: ['Cute & casual 🌸', 'Dressy & fancy ✨', 'Comfy & chill 🧸'],
    noteTitle: 'Anything you want to tell me?',
    whatsapp: '601162316682',
    message:
      "Hi sayang! 🥹💖\n\nI just opened my birthday card and... YES! 🎉 I'd love to go on a date with you {date}! 🥰\n\n🤩 Most excited for: {food}\n👗 Outfit vibe: {vibe}\n💌 Note: {note}\n\nThank you for the card, I love it! See you at 12 tomorrow 😘\n— {nickname}",
    successGif: '/memes/yaaasss.gif',
    successTitle: "YAY!! It's a date! 🥳",
    successText: 'Opening WhatsApp so you can send your answer to Fitri…',
  },

  music: {
    src: '',
    useMusicBox: true,
  },

  footer: 'Made with way too much love (and a little bit of code) by Fitri',
};
