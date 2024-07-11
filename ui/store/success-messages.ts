const SuccessMessages = [
  '💣 Boom!',
  '💥 Babbamm!',
  '🙌 Yes!',
  '🤝 Nice work!',
  '🧐 Impressive!',
  '💣 💥  Baboom!',
  `🛼 That's how we roll!`,
  '🥁 Drum roll!',
  '🦸 Super!',
  '😎  Sublime!',
  '😌 Noice!',
  '😌 Nice!',
  '💥 Hulk Smash!',
  `🧻🧻 You're on a roll!`,
  `💆 Well didn't that feel nice...`,
  '🤤 Nerdgasm!',
];

export const pickSuccessMessage = () => {
  return SuccessMessages[Math.floor(Math.random() * SuccessMessages.length)];
};
