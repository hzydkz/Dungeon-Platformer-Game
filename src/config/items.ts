/**
 * 아이템, 골드, 상점, 레벨 (기획자 요청으로 '강화'를 대체). [가정] 튜닝 대상.
 */

/** 아이템 등급: F가 가장 흔하고 S가 가장 귀하다 */
export const GRADES = ['F', 'E', 'D', 'C', 'B', 'A', 'S'] as const;
export type Grade = (typeof GRADES)[number];

export const ITEMS = {
  /** 아이템 칸 수 */
  slots: 3,
  /** 등급별 기본 가중치 (F→S, 피라미드) */
  gradeWeights: [32, 24, 17, 12, 8, 5, 2] as readonly number[],
  /**
   * 등급 행운: 가중치 × (1 + 행운)^등급번호. 층이 오를수록, 보상 출처가 좋을수록 높은 등급이 잘 나온다.
   * 행운이 커도 가중치가 F→S로 줄어드는 모양(피라미드)은 유지되도록 작은 값을 쓴다 (테스트로 검사).
   */
  luckPerFloor: 0.02,
  luckBySource: { shop: 0, floorBoss: 0.08, redBoss: 0.2, altar: 0.12, vault: 0.15 },
  /** 행운 상한: 이 값 이하에서는 F→S 가중치가 항상 줄어든다 (0.75 × 1.3 < 1) */
  maxLuck: 0.3,
  /** 보스 처치 아이템 선택지 수 */
  bossChoices: 3,
  /** 등급 표시 색 */
  gradeColors: {
    F: '#a0a0b0',
    E: '#80d080',
    D: '#60a8f0',
    C: '#b080f0',
    B: '#f0b040',
    A: '#ff6a4a',
    S: '#fff060',
  } as Readonly<Record<Grade, string>>,
} as const;

/** 골드 */
export const ECONOMY = {
  /** 층 배율: × (1 + perLevel × (난이도 레벨 - 1)) */
  goldPerLevel: 0.15,
  /** 몬스터 처치 골드 (최소, 최대) */
  monsterGold: [1, 3] as readonly [number, number],
  /** 보스 처치 골드 (빨간 던전은 × redBossGoldMultiplier) */
  bossGold: 40,
  /** 잠긴 방 보물 상자 골드 (× 층 골드 배율) */
  vaultGold: 40,
  redBossGoldMultiplier: 1.5,
  /** 상자: healChance 확률로 회복, 나머지는 골드 */
  chest: {
    healChance: 0.4,
    healRatio: 0.25,
    gold: [12, 24] as readonly [number, number],
  },
} as const;

/** 상점 (층마다 1곳, 지도에 처음부터 표시) */
export const SHOP = {
  /** 파는 아이템 수 */
  stock: 3,
  /** 등급별 기본 가격 (F→S) */
  prices: [30, 50, 80, 120, 180, 260, 380] as readonly number[],
  /** 층 가격 배율: × (1 + perFloor × (층 - 1)) */
  pricePerFloor: 0.1,
  /** 회복 물약 */
  potion: { price: 25, healRatio: 0.35, count: 2 },
} as const;

/** 레벨 */
export const LEVEL = {
  /** 경험치: 몬스터 1마리 / 보스. 난이도 레벨의 몬스터 배율을 곱한다 */
  monsterXp: 6,
  bossXp: 60,
  redBossXpMultiplier: 1.5,
  /** 레벨 n → n+1에 필요한 경험치 = round(base × n^exponent) */
  xpBase: 30,
  xpExponent: 1.25,
  /** 레벨당 (Lv1 대비) 최대 체력, 공격력 증가율 */
  hpPerLevel: 0.1,
  attackPerLevel: 0.09,
  /** 레벨 업 시 최대 체력 대비 회복 */
  levelUpHealRatio: 0.3,
} as const;
