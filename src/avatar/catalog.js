// Catálogo do sistema de avatares: personagens, roupas, cabelos, acessórios,
// coleção de anime, efeitos e raridades. Só dados — a geometria vive em
// builder.js e a interface em ui/avatar-studio.js.

export const RARITY = {
  comum: { id: 'comum', label: 'Comum', color: '#9fb4d8' },
  raro: { id: 'raro', label: 'Raro', color: '#63d3ff' },
  epico: { id: 'epico', label: 'Épico', color: '#c79bff' },
  lendario: { id: 'lendario', label: 'Lendário', color: '#ffd479' },
  mitico: { id: 'mitico', label: 'Mítico', color: '#ff9be8' },
};

export const RARITY_ORDER = ['comum', 'raro', 'epico', 'lendario', 'mitico'];

/** Custos em moedas (🪙) para desbloquear itens pagos. */
export const COSTS = { comum: 0, raro: 6, epico: 14, lendario: 26, mitico: 45 };

export const ANIME_COLLECTIONS = [
  { id: 'jujutsu', name: 'Jujutsu Kaisen', icon: '🧿', color: '#b98bff' },
  { id: 'dragonball', name: 'Dragon Ball', icon: '🔥', color: '#ffb45c' },
  { id: 'spyfamily', name: 'Spy x Family', icon: '🕵️', color: '#ff9bd0' },
  { id: 'naruto', name: 'Naruto', icon: '🥷', color: '#ffb36b' },
  { id: 'onepiece', name: 'One Piece', icon: '🏴‍☠️', color: '#63d3ff' },
  { id: 'witch', name: 'Little Witch Academia', icon: '🧹', color: '#a6f0c6' },
];

// ---------------------------------------------------------------- personagens
export const SPECIES = [
  {
    id: 'pinguim', name: 'Pip, o Pinguim', icon: '🐧', rarity: 'comum', cost: 0,
    desc: 'Barriga branca, corpo redondo e passinhos engraçados. O melhor amigo de quem está começando.',
    colors: ['#3f7fd6', '#5a6bb5', '#4aa6a0', '#7a6fb8', '#df6d8f', '#3b4763'],
  },
  {
    id: 'sorvete', name: 'Gelato', icon: '🍦', rarity: 'comum', cost: 0,
    desc: 'Um sorvete vivo: casquinha crocante, cobertura brilhante e confeitos que saltam quando ele ri.',
    colors: ['#ffc2df', '#ffd98a', '#b6e5b1', '#c9c2ff', '#ffb0a0', '#8fe4e8'],
  },
  {
    id: 'urso', name: 'Mel, a Ursinha', icon: '🐻', rarity: 'comum', cost: 0,
    desc: 'Abraços macios e orelhas redondas. Sempre com um pote de mel imaginário na mochila.',
    colors: ['#c98d5c', '#8f6a4f', '#e8c39e', '#d9a86c', '#a87c8f', '#6f8fc0'],
  },
  {
    id: 'gato', name: 'Mimi, a Gatinha', icon: '🐱', rarity: 'raro', cost: 6,
    desc: 'Curiosa de plantão: mia para as estrelas e adora descobrir passagens escondidas.',
    colors: ['#f0a35e', '#6f7f9e', '#f3e2c7', '#c98de0', '#5fbfa5', '#e28f8f'],
  },
  {
    id: 'coelho', name: 'Pipoca, a Coelha', icon: '🐰', rarity: 'raro', cost: 8,
    desc: 'Duas orelhas enormes que giram quando ela escuta um segredo do bosque.',
    colors: ['#f7f2ea', '#e6d4c3', '#f3c9d6', '#cfe3f5', '#f0dca0', '#d8c6ef'],
  },
  {
    id: 'raposa', name: 'Fizz, a Raposa', icon: '🦊', rarity: 'epico', cost: 14,
    desc: 'Esperta, elegante e cheia de truques de luz. A cauda balança quando ela tem uma ideia.',
    colors: ['#f08a4b', '#e0743f', '#c99a6c', '#8f6bb5', '#5fa6c9', '#e4a0b8'],
  },
  {
    id: 'estrela', name: 'Nova, a Estrelinha', icon: '⭐', rarity: 'mitico', cost: 30,
    desc: 'Personagem original: nasceu de um fragmento de luz que caiu na clareira. Brilha no escuro.',
    colors: ['#ffe38a', '#ffc0e0', '#b6f0ff', '#d8c5ff', '#b6ffd0', '#ffb48a'],
  },
];

// ---------------------------------------------------------------- expressões
export const EXPRESSIONS = [
  { id: 'feliz', name: 'Feliz', icon: '😊' },
  { id: 'surpreso', name: 'Surpreso', icon: '😮' },
  { id: 'timido', name: 'Tímido', icon: '😳' },
  { id: 'confiante', name: 'Confiante', icon: '😏' },
  { id: 'sonolento', name: 'Sonolento', icon: '😴' },
];

// ---------------------------------------------------------------- roupas
// style: veste | vestido | casaco | uniforme | armadura | pijama
export const OUTFITS = [
  { id: 'nenhum', name: 'Sem roupa extra', icon: '—', rarity: 'comum', style: 'nenhum', desc: 'O visual natural do bichinho.' },
  { id: 'avental', name: 'Avental de aventura', icon: '🧵', rarity: 'comum', style: 'veste', desc: 'Um avental simples e confortável para explorar.' },
  { id: 'casaco', name: 'Casaco quentinho', icon: '🧥', rarity: 'raro', style: 'casaco', desc: 'Bolsos fundos para guardar pedrinhas brilhantes.' },
  { id: 'vestido', name: 'Vestido de flores', icon: '👗', rarity: 'raro', style: 'vestido', desc: 'Saias rodadas com pétalas bordadas.' },
  { id: 'uniforme', name: 'Uniforme da clareira', icon: '🎽', rarity: 'comum', style: 'uniforme', desc: 'O traje dos pequenos guardiões do bosque.' },
  { id: 'armadura', name: 'Armadura estelar', icon: '🥋', rarity: 'epico', style: 'armadura', desc: 'Placas leves que refletem a luz da lanterna.' },
  { id: 'pijama', name: 'Pijama de nuvem', icon: '🩳', rarity: 'comum', style: 'pijama', desc: 'Fofinho, macio e ótimo para cochilar no acampamento.' },
  { id: 'jiujitsu', name: 'Uniforme de feiticeiro', icon: '🧿', rarity: 'epico', style: 'uniforme', anime: 'jujutsu', desc: 'Coleção Jujutsu: uniforme escuro com detalhes claros.' },
  { id: 'gi', name: 'Gi de artes marciais', icon: '🥋', rarity: 'raro', style: 'uniforme', anime: 'dragonball', desc: 'Coleção Dragon Ball: gi laranja pronto para treinar.' },
  { id: 'vestido-espiã', name: 'Vestido de espiã', icon: '🕵️', rarity: 'epico', style: 'vestido', anime: 'spyfamily', desc: 'Coleção Spy x Family: elegante e cheio de segredos.' },
  { id: 'traje-ninja', name: 'Traje ninja', icon: '🥷', rarity: 'raro', style: 'uniforme', anime: 'naruto', desc: 'Coleção Naruto: leve, silencioso e pronto para saltar.' },
  { id: 'casaco-pirata', name: 'Casaco de pirata', icon: '🏴‍☠️', rarity: 'lendario', style: 'casaco', anime: 'onepiece', desc: 'Coleção One Piece: casaco de capitão para mares desconhecidos.' },
  { id: 'uniforme-luna', name: 'Uniforme de bruxinha', icon: '🧹', rarity: 'epico', style: 'uniforme', anime: 'witch', desc: 'Coleção Little Witch: uniforme de academia de magia.' },
];

// ---------------------------------------------------------------- cabelos
export const HAIRS = [
  { id: 'nenhum', name: 'Sem cabelo', icon: '—', rarity: 'comum', style: 'nenhum' },
  { id: 'franja', name: 'Franja fofa', icon: '💇', rarity: 'comum', style: 'franja' },
  { id: 'maria', name: 'Marias-chiquinhas', icon: '🎀', rarity: 'raro', style: 'maria' },
  { id: 'topete', name: 'Topete atrevido', icon: '💫', rarity: 'comum', style: 'topete' },
  { id: 'cacheado', name: 'Cachos saltitantes', icon: '🌀', rarity: 'raro', style: 'cacheado' },
  { id: 'espetado', name: 'Cabelo espetado', icon: '⚡', rarity: 'lendario', style: 'espetado', anime: 'dragonball', desc: 'Coleção Dragon Ball: pontas para cima, energia lá no alto.' },
  { id: 'espinho', name: 'Espinhos de feiticeiro', icon: '🌪', rarity: 'epico', style: 'espetado', anime: 'jujutsu', desc: 'Coleção Jujutsu: fios revoltos de energia amaldiçoada.' },
  { id: 'coque', name: 'Coque de bruxinha', icon: '🌙', rarity: 'raro', style: 'coque', anime: 'witch', desc: 'Coleção Little Witch: coque arrumado para voar de vassoura.' },
  { id: 'laco', name: 'Laço elegante', icon: '🎀', rarity: 'epico', style: 'laco', anime: 'spyfamily', desc: 'Coleção Spy x Family: laço delicado de missão especial.' },
];

// ---------------------------------------------------------------- chapéus
export const HEADS = [
  { id: 'nenhum', name: 'Sem chapéu', icon: '—', rarity: 'comum', style: 'nenhum' },
  { id: 'gorro', name: 'Gorro de lã', icon: '🧢', rarity: 'comum', style: 'gorro' },
  { id: 'cogumelo', name: 'Chapéu de cogumelo', icon: '🍄', rarity: 'raro', style: 'cogumelo' },
  { id: 'capacete', name: 'Capacete de explorador', icon: '⛑', rarity: 'comum', style: 'capacete' },
  { id: 'pirata', name: 'Chapéu de pirata', icon: '🏴‍☠️', rarity: 'lendario', style: 'pirata', anime: 'onepiece', desc: 'Coleção One Piece: o chapéu de palha de quem sonha alto.' },
  { id: 'bandana', name: 'Bandana ninja', icon: '🥷', rarity: 'raro', style: 'bandana', anime: 'naruto', desc: 'Coleção Naruto: bandana com placa metálica.' },
  { id: 'bruxa', name: 'Chapéu de bruxa', icon: '🧙', rarity: 'lendario', style: 'bruxa', anime: 'witch', desc: 'Coleção Little Witch: ponta torta e fita brilhante.' },
  { id: 'coroa', name: 'Coroa de estrelas', icon: '👑', rarity: 'mitico', style: 'coroa', desc: 'Item mítico: uma coroa que gira lentamente com brilho próprio.' },
];

// ---------------------------------------------------------------- rosto
export const FACES = [
  { id: 'nenhum', name: 'Nenhum', icon: '—', rarity: 'comum', style: 'nenhum' },
  { id: 'redondo', name: 'Óculos redondos', icon: '👓', rarity: 'comum', style: 'redondo' },
  { id: 'escuros', name: 'Óculos escuros', icon: '🕶', rarity: 'raro', style: 'escuros', anime: 'jujutsu', desc: 'Coleção Jujutsu: lentes escuras para esconder o poder.' },
  { id: 'venda', name: 'Venda de feiticeiro', icon: '🩹', rarity: 'epico', style: 'venda', anime: 'jujutsu', desc: 'Coleção Jujutsu: faixa nos olhos, visão além do comum.' },
  { id: 'scouter', name: 'Scouter tecnológico', icon: '📡', rarity: 'lendario', style: 'scouter', anime: 'dragonball', desc: 'Coleção Dragon Ball: mede energia com um bip divertido.' },
  { id: 'mascara', name: 'Máscara de espião', icon: '🎭', rarity: 'raro', style: 'mascara', anime: 'spyfamily', desc: 'Coleção Spy x Family: disfarce perfeito para missões.' },
  { id: 'cicatriz', name: 'Cicatriz de aventura', icon: '🩹', rarity: 'comum', style: 'cicatriz', anime: 'onepiece', desc: 'Coleção One Piece: marca de quem já viveu grandes histórias.' },
  { id: 'faixa', name: 'Faixa ninja', icon: '🥋', rarity: 'raro', style: 'faixa', anime: 'naruto', desc: 'Coleção Naruto: faixa colorida de chakra.' },
];

// ---------------------------------------------------------------- costas
export const BACKS = [
  { id: 'nenhum', name: 'Nenhum', icon: '—', rarity: 'comum', style: 'nenhum' },
  { id: 'mochila', name: 'Mochila de aventura', icon: '🎒', rarity: 'comum', style: 'mochila' },
  { id: 'asas', name: 'Asas de fada', icon: '🦋', rarity: 'epico', style: 'asas' },
  { id: 'capa', name: 'Capa de herói', icon: '🦸', rarity: 'raro', style: 'capa' },
  { id: 'vassoura', name: 'Vassoura mágica', icon: '🧹', rarity: 'epico', style: 'vassoura', anime: 'witch', desc: 'Coleção Little Witch: voa baixinho e deixa rastro de estrelas.' },
  { id: 'kunai', name: 'Bolsa de kunai', icon: '🗡', rarity: 'raro', style: 'bolsa', anime: 'naruto', desc: 'Coleção Naruto: mochila com kunais decorativas.' },
  { id: 'espiã', name: 'Bolsa de espiã', icon: '👛', rarity: 'raro', style: 'bolsa', anime: 'spyfamily', desc: 'Coleção Spy x Family: pequena, elegante e cheia de apetrechos.' },
  { id: 'pirata-capa', name: 'Capa de capitão', icon: '🏴‍☠️', rarity: 'lendario', style: 'capa', anime: 'onepiece', desc: 'Coleção One Piece: capa que ondula com o vento do mar.' },
  { id: 'esferas', name: 'Esferas do Dragão', icon: '🔮', rarity: 'mitico', style: 'esferas', anime: 'dragonball', desc: 'Coleção Dragon Ball: quatro esferas flutuando ao redor.' },
];

// ---------------------------------------------------------------- efeitos / auras
export const AURAS = [
  { id: 'nenhum', name: 'Sem efeito', icon: '—', rarity: 'comum', color: '#ffffff' },
  { id: 'brilho', name: 'Brilho suave', icon: '✨', rarity: 'comum', color: '#d9fff0' },
  { id: 'energia', name: 'Aura de energia', icon: '🔵', rarity: 'raro', color: '#7ec8ff', anime: 'dragonball' },
  { id: 'amaldicoada', name: 'Aura amaldiçoada', icon: '🟣', rarity: 'epico', color: '#b98bff', anime: 'jujutsu' },
  { id: 'chakra', name: 'Chakra', icon: '🌀', rarity: 'raro', color: '#8ff0d0', anime: 'naruto' },
  { id: 'saiyajin', name: 'Aura Saiyajin', icon: '🔥', rarity: 'lendario', color: '#ffd36b', anime: 'dragonball' },
  { id: 'estelar', name: 'Poeira estelar', icon: '🌟', rarity: 'mitico', color: '#ff9be8', anime: 'witch' },
];

// ---------------------------------------------------------------- cores
export const BODY_COLORS = [
  { id: 'azul', hex: '#3f7fd6' }, { id: 'menta', hex: '#4fb8a6' }, { id: 'rosa', hex: '#ef8fb0' },
  { id: 'roxo', hex: '#8f7ad6' }, { id: 'amarelo', hex: '#f3c86b' }, { id: 'laranja', hex: '#ef9a5c' },
  { id: 'branco', hex: '#f2f4fa' }, { id: 'cinza', hex: '#7d8ba3' },
];

export const OUTFIT_COLORS = [
  { id: 'verde', hex: '#57d99a' }, { id: 'azul', hex: '#63a6ff' }, { id: 'rosa', hex: '#ff9bd0' },
  { id: 'roxo', hex: '#b18cff' }, { id: 'laranja', hex: '#ffa95c' }, { id: 'vermelho', hex: '#ff7b7b' },
  { id: 'amarelo', hex: '#ffd479' }, { id: 'escuro', hex: '#3b4666' },
];

export const HAIR_COLORS = [
  { id: 'castanho', hex: '#5a4632' }, { id: 'preto', hex: '#252a3d' }, { id: 'loiro', hex: '#f0d48a' },
  { id: 'ruivo', hex: '#cf6b3c' }, { id: 'rosa', hex: '#ff9bd0' }, { id: 'azul', hex: '#6fb4ff' },
  { id: 'branco', hex: '#eef1f8' }, { id: 'roxo', hex: '#a98bff' },
];

// ---------------------------------------------------------------- padrão
export const DEFAULT_AVATAR = {
  species: 'pinguim',
  bodyColor: '#3f7fd6',
  expression: 'feliz',
  outfit: 'nenhum', outfitColor: '#57d99a',
  hair: 'nenhum', hairColor: '#5a4632',
  head: 'nenhum',
  face: 'nenhum',
  back: 'nenhum',
  aura: 'nenhum',
};

const ALL_LISTS = { species: SPECIES, outfit: OUTFITS, hair: HAIRS, head: HEADS, face: FACES, back: BACKS, aura: AURAS };

export const ALL_ITEMS = Object.entries(ALL_LISTS)
  .flatMap(([slot, list]) => list.map((i) => ({ ...i, slot })));

export function listFor(slot) { return ALL_LISTS[slot] || []; }

export function itemById(slot, id) {
  const list = listFor(slot);
  return list.find((i) => i.id === id) || list[0];
}

/** Itens gratuitos por padrão (mostrados como "Grátis" na coleção). */
export function itemCost(item) { return item?.cost ?? 0; }
