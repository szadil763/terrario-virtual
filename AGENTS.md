# Notas para agentes — Luz do Bosque

Jogo de aventura/exploração/combate em terceira pessoa, 3D estilizado, em português.
Substitui o app anterior (Terrário Virtual): o repositório agora é um jogo, sem build step.

## Como rodar no sandbox

- `docker compose -f docker-compose.base44.yml up -d --build` → web em `http://localhost:3000`.
- Servidor: Browsersync (`node:22`) servindo o repositório na porta 3000, com live reload em
  `index.html`, `src/**/*.js` e `vendor/**/*.js`. Não há bundler, transpilador nem instalação de dependências.
- Sem segredos e sem serviços externos: nenhuma variável de ambiente é necessária para o app subir.
  `BASE44_PREVIEW_MODE` é repassado ao serviço apenas como pass-through (bare); o código **não** tem
  nenhum caminho específico de sandbox, host allowlist ou origem — o Browsersync não bloqueia Host/Origin.
- Three.js r160 está **vendado** em `vendor/three/three.module.js` e resolvido pelo importmap em
  `index.html` (`"three": "./vendor/three/three.module.js"`). Não troque por CDN nem por `npm install`.
- Verificação: abrir `/` → tela de título → **Começar aventura** → o acampamento aparece com a fogueira,
  o HUD (vida/energia, 6 ícones de habilidade, minimapa) e as dicas de tutorial.

## Arquitetura (cada sistema em seu módulo)

```
src/main.js               loop, máquina de estados do jogo, salvamento, integração dos sistemas
src/core/state.js         StateMachine, Emitter, utilidades numéricas
src/core/settings.js      opções, acessibilidade, remapeamento de teclas/mouse (M1–M4)
src/core/save.js          localStorage (chave luzdobosque.save.v1)
src/core/input.js         teclado + mouse + toque unificados (ACTIONS)
src/core/audio.js         música e efeitos 100% procedurais (WebAudio), canais separados
src/core/camera.js        câmera em terceira pessoa (órbita pelo cursor, zoom, tremor)
src/player/player.js      movimentação, dash, salto, colisão, animação procedural
src/player/lantern.js     poderes, energia, recargas, melhorias, afinidades de bioma, manobras (R)
src/systems/combat.js     projéteis, dano, reflexo em cristais, objetos destrutíveis
src/systems/enemies.js    sombra travessa, cogumelo saltitante, espírito brincalhão
src/systems/miniboss.js   Guardião Antigo (fases, telegrafia, vulnerabilidade, recompensas)
src/systems/loot.js       itens, baús (comum/raro/secreto), mochila
src/systems/interactables.js  baús, caixotes, alavancas, portas, cristais, flores, paredes secretas,
                              inscrições, ponto de descanso, gancho, coletáveis
src/systems/npc.js        diálogos com escolhas, missões (QuestManager) e reações às manobras
src/world/effects.js      partículas, brilhos, anéis, feixes (shader próprio, sem texturas externas)
src/world/biome.js        terreno, colisão, Floresta Encantada e registro dos biomas futuros
src/ui/hud.js             barras, habilidades, minimapa, avisos, controles de toque
src/ui/menus.js           título, pausa, opções, melhorias, mochila, missões, mapa, diálogo, morte
```

## Detalhes não óbvios

- **Handle de depuração:** `window.__game` expõe os sistemas (`fsm`, `player`, `lantern`, `world`,
  `enemies`, `miniboss`, `inventory`, `quests`, `settings`). Útil para inspeção manual no console.
- **Estado do jogo:** `loading → title → playing → (paused | dead)`. `paused` cobre qualquer tela aberta;
  com tela aberta o mundo continua animando devagar e os inimigos não agem.
- **Teclas de conforto:** `Esc` abre/fecha a pausa e volta de sub-telas; `M` abre/fecha o mapa; `E` interage;
  `R` manobras. Quando uma tecla é tratada no `frame()` (fora do `updatePlaying`), ela precisa de
  `input.consume(...)` — sem isso a mesma tecla é lida duas vezes no mesmo quadro (a pausa voltava a pausar).
- **Áreas seguras são de verdade:** `world.isSafe(position)` desliga a IA dos inimigos e do minichefe.
  Se mexer nisso, o jogador volta a morrer no acampamento em segundos (já aconteceu).
- **Câmera:** controlada por 4 fontes — cursor na tela (`lookFromPointer`), setas do teclado
  (`camLeft/Right/Up/Down`), arraste na `#lookzone` (toque, via `input.addLookDelta`/`consumeLookDelta`)
  e recentralização automática (`autoAlign`, só depois de 2,2 s sem toque manual, marcado por
  `manualTimer`). A câmera nunca desce abaixo de `terrainHeight + 0,7` (o `world` entra em
  `updateCamera` como `opts.world`). Corrida (Shift/`sprint`) multiplica a velocidade em ~1,4×,
  sem custo de energia.
- **Eixos de toque:** `input.touchAxis` é `{x, z}` e `setTouchAxis`/`moveAxis` saneiam valores não finitos.
  Um evento de ponteiro sem coordenadas já contaminou a posição do jogador (NaN + queda infinita); o
  `Player.update` tem uma rede de segurança que devolve o aventureiro ao ponto de descanso.
- **Rótulos M1–M4:** o botão 1 do mouse é o do meio e o 2 é o direito; `settings.shortLabel()` usa
  `MOUSE_SHORT` para o HUD dizer M1 ataque, M2 defesa, M3 especial, M4 poder.
- **Áudio:** só começa após o primeiro gesto (política de autoplay); `audio.setTrack()` troca entre
  exploração, área segura, combate, minichefe e áreas secretas.
- **Botões `[data-close]`** são capturados por delegação no `document`, porque as telas de melhorias,
  mochila, missões, mapa e opções são desenhadas dinamicamente.
- Sem suíte de testes: a verificação é jogar/inspecionar no preview.

## Progressão implementada (Floresta Encantada)

- Trilha principal: falar com Lumi → 3 fragmentos mágicos → acender o Altar da Clareira Antiga →
  a passagem entre biomas desperta (os outros 6 biomas aparecem como "em breve" no mapa).
- Secundárias: resgatar Téo (levá-lo ao acampamento) e desabrochar 5 flores luminosas.
- Segredos: paredes ilusórias, baú atrás do portão de pedra (2 alavancas), 4 cristais refletivos,
  ponte de raízes criada pelo pulso luminoso, planalto com gancho luminoso, cofre do Guardião (chave).
- Poderes: raio de luz, disparo carregado, pulso luminoso, escudo de luz, revelação (M4) e gancho
  luminoso (ao concluir a missão principal). Purificação converte criaturas corrompidas em amigas.

## Como expandir

1. `BIOME_LIST` (world/biome.js) marca os biomas; implemente um novo `World.build('<id>')`.
2. Poderes do bioma: `BIOME_POWERS` (player/lantern.js) + reação do mundo em `World.reactToPower`.
3. Inimigos/minichefes: `ENEMY_TYPES` (systems/enemies.js) e um novo arquivo para o chefe.
4. Conteúdo: registre objetos no `InteractionManager` (`world.interactions.add`) com `interact(ctx)`;
   o `ctx` traz `give`, `toast`, `inventory`, `quests`, `audio`, `effects` e `events`.
