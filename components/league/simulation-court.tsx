"use client";
import { useEffect, useRef, useState } from "react";
import type Phaser from "phaser";
import { courtFrame, type Simulation } from "@/lib/simulation";

export default function SimulationCourt({ game, clock, motion, onReady }: { game: Simulation; clock: { current: number }; motion: boolean; onReady: () => void }) {
  const host = useRef<HTMLDivElement>(null), state = useRef({ game, clock, motion });
  state.current = { game, clock, motion };
  const ready = useRef(onReady); ready.current = onReady;
  const [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false, instance: Phaser.Game | undefined;
    const images: HTMLImageElement[] = [];
    const renderSize = () => Math.ceil(1000 * Math.max(1, Math.min(3, (host.current?.clientWidth ?? 1000) * Math.min(window.devicePixelRatio || 1, 2) / 1000)));
    let resize: ResizeObserver | undefined;
    setError(false);
    import("phaser").then(({ default: P }) => {
      if (cancelled || !host.current) return;
      class Court extends P.Scene {
        ink!: Phaser.GameObjects.Graphics;
        ball!: Phaser.GameObjects.Graphics;
        portraits: Phaser.GameObjects.Image[] = [];

        create() {
          this.cameras.main.setZoom(this.scale.width / 1000).centerOn(500, 280);
          const g = this.add.graphics();
          g.fillStyle(0x192c32).fillRect(0, 0, 1000, 560);
          for (let x = 30; x < 970; x += 47) g.fillStyle(x % 94 ? 0x233b40 : 0x263e43).fillRect(x, 30, 47, 500);
          g.fillStyle(0x192c32).fillRect(30, 200, 190, 160).fillRect(780, 200, 190, 160);
          g.lineStyle(2, 0x8ca39f, .75).strokeRect(30, 30, 940, 500).lineBetween(500, 30, 500, 530).strokeCircle(500, 280, 60);
          g.strokeRect(30, 200, 190, 160).strokeRect(780, 200, 190, 160).strokeCircle(220, 280, 60).strokeCircle(780, 280, 60);
          // Three-point arcs: clipped to the baseline; corner lines complete each arc.
          for (const left of [true, false]) {
            const cx = left ? 82.5 : 917.5, sign = left ? 1 : -1;
            const angle = Math.acos(-52.5 / 237.5);
            g.beginPath();
            for (let i = 0; i <= 80; i++) {
              const a = -angle + i / 80 * angle * 2, x = cx + sign * Math.cos(a) * 237.5, y = 280 + Math.sin(a) * 237.5;
              if (!i) g.moveTo(x, y); else g.lineTo(x, y);
            }
            g.strokePath();
            g.lineStyle(3, 0xd7dbcc).lineBetween(left ? 70 : 930, 250, left ? 70 : 930, 310);
            g.lineStyle(3, 0xffcd75).strokeCircle(cx, 280, 8);
            g.lineStyle(2, 0x8ca39f, .75);
          }
          this.add.text(500, 280, "F", { fontFamily: "Pixelify Sans, monospace", fontSize: "48px", color: "#8ca39f" }).setOrigin(.5).setAlpha(.4);
          this.ink = this.add.graphics();
          // Circular portrait textures use the same ESPN headshots as the roster.
          // Initials remain available when a photo is missing or cannot load.
          state.current.game.players.forEach((player, i) => {
            const canvas = document.createElement("canvas"); canvas.width = canvas.height = 192;
            const ctx = canvas.getContext("2d")!; ctx.scale(2, 2);
            const paint = (photo?: HTMLImageElement) => {
              ctx.clearRect(0, 0, 96, 96); ctx.save(); ctx.beginPath(); ctx.arc(48, 48, 46, 0, Math.PI * 2); ctx.clip();
              ctx.fillStyle = i < 5 ? "#7cd9c4" : "#ed91aa"; ctx.fillRect(0, 0, 96, 96);
              if (photo) { const w = 122, h = w * photo.naturalHeight / photo.naturalWidth; ctx.drawImage(photo, (96 - w) / 2, 96 - h, w, h); }
              else { ctx.fillStyle = "#141827"; ctx.font = "bold 30px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(player.name.split(" ").map(w => w[0]).slice(0, 2).join(""), 48, 48); }
              ctx.restore(); ctx.strokeStyle = i < 5 ? "#7cd9c4" : "#ed91aa"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(48, 48, 44, 0, Math.PI * 2); ctx.stroke();
            };
            paint();
            const texture = this.textures.addCanvas(`portrait-${i}`, canvas)!;
            this.portraits.push(this.add.image(0, 0, texture.key).setDisplaySize(38, 38));
            if (player.id > 0) {
              const photo = new Image(); images.push(photo); photo.referrerPolicy = "no-referrer";
              photo.onload = () => { if (!cancelled && photo.naturalWidth) { paint(photo); texture.refresh(); } };
              photo.src = `https://a.espncdn.com/i/headshots/nba/players/full/${player.id}.png`;
            }
          });
          this.ball = this.add.graphics();
          ready.current();
          this.game.canvas.setAttribute("aria-hidden", "true");
        }
        update() {
          if (!this.ink) return;
          const { game, clock, motion } = state.current, time = clock.current, frame = courtFrame(game, time, motion), g = this.ink;
          g.clear();
          frame.spots.forEach((p, i) => {
            const x = 30 + p.x * 10, y = 30 + p.y * 10;
            g.fillStyle(0x000000, .25).fillEllipse(x + 2, y + 6, 30, 18);
            if (i === frame.focus && time > 0 && time < game.playbackDuration) g.lineStyle(2, 0xffcd75, .8).strokeCircle(x, y, 19);
            this.portraits[i].setPosition(x, y);
          });
          const x = 30 + frame.ball.x * 10, y = 30 + frame.ball.y * 10;
          const ball = this.ball; ball.clear();
          ball.fillStyle(0x000000, .3).fillEllipse(x, y + 5, 12, 6);
          ball.fillStyle(0xffb65c).fillCircle(x, y - frame.height * 10, 7 + frame.height);
          ball.lineStyle(1.5, 0x7a461b).strokeCircle(x, y - frame.height * 10, 7 + frame.height).lineBetween(x - 6, y - frame.height * 10, x + 6, y - frame.height * 10).lineBetween(x, y - frame.height * 10 - 6, x, y - frame.height * 10 + 6);
        }
      }
      instance = new P.Game({ type: P.CANVAS, parent: host.current, width: renderSize(), height: Math.round(renderSize() * .56), backgroundColor: "#192c32",
        scale: { mode: P.Scale.FIT, autoCenter: P.Scale.CENTER_BOTH }, scene: Court, audio: { noAudio: true }, banner: false, fps: { target: 60 } });
      resize = new ResizeObserver(() => {
        if (!instance || cancelled) return;
        const width = renderSize();
        if (instance.scale.width === width) return;
        instance.scale.resize(width, Math.round(width * .56));
        instance.scene.getScenes(true).forEach(scene => scene.cameras.main.setZoom(width / 1000).centerOn(500, 280));
      });
      resize.observe(host.current);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; resize?.disconnect(); images.forEach(photo => { photo.onload = null; photo.onerror = null; }); instance?.destroy(true); };
  }, [retry]);
  return <div className="sim-court" role="img" aria-label="Animated exhibition basketball court. Score, play descriptions and player stats are available below.">
    <div ref={host} className="sim-canvas" />
    {error && <div className="sim-court-error">Court could not load. <button className="button" onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
  </div>;
}
