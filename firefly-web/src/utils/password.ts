const passwordUpperChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const passwordLowerChars = 'abcdefghijkmnopqrstuvwxyz';
const passwordDigitChars = '23456789';
const passwordSymbolChars = '!@#$%^&*';
const passwordAllChars = `${passwordUpperChars}${passwordLowerChars}${passwordDigitChars}${passwordSymbolChars}`;

const fillRandomNumbers = (length: number): number[] => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(length);
    cryptoApi.getRandomValues(values);
    return Array.from(values);
  }
  return Array.from({ length }, () => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
};

const pickRandomChars = (charset: string, count: number): string[] => {
  const randomNumbers = fillRandomNumbers(count);
  return randomNumbers.map((value) => charset[value % charset.length]);
};

const shuffleChars = (chars: string[]): string[] => {
  const nextChars = [...chars];
  const randomNumbers = fillRandomNumbers(Math.max(0, nextChars.length - 1));
  for (let index = nextChars.length - 1; index > 0; index -= 1) {
    const swapIndex = randomNumbers[nextChars.length - 1 - index] % (index + 1);
    [nextChars[index], nextChars[swapIndex]] = [nextChars[swapIndex], nextChars[index]];
  }
  return nextChars;
};

export const generateRandomPassword = (length = 12): string => {
  const requiredChars = [
    ...pickRandomChars(passwordUpperChars, 1),
    ...pickRandomChars(passwordLowerChars, 1),
    ...pickRandomChars(passwordDigitChars, 1),
    ...pickRandomChars(passwordSymbolChars, 1),
  ];
  const remainingCount = Math.max(0, length - requiredChars.length);
  const remainingChars = pickRandomChars(passwordAllChars, remainingCount);
  return shuffleChars([...requiredChars, ...remainingChars]).join('');
};
