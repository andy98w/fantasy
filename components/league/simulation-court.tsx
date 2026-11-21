"use client";
import { useEffect, useRef, useState } from "react";
import type Phaser from "phaser";
import { courtFrame, type Simulation } from "@/lib/simulation";

export default function SimulationCourt({ game, time, motion }: { game: Simulation; time: number; motion: boolean }) {
  const host = useRef<HTMLDivElement>(null), state = useRef({ game, time, motion });
  state.current = { game, time, motion };
  const [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false, instance: Phaser.Game | undefined;
    setError(false);
    import("phaser").then(({ default: P }) => {
      if (cancelled || !host.current) return;
      class Court extends P.Scene {
        ink!: Phaser.GameObjects.Graphics;
        numbers: Phaser.GameObjects.Text[] = [];
        names: Phaser.GameObjects.Text[] = [];
        create() {
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
          for (let i = 0; i < 10; i++) {
            this.numbers.push(this.add.text(0, 0, String(i % 5 + 1), { fontFamily: "Arial", fontSize: "13px", fontStyle: "bold", color: "#141827" }).setOrigin(.5));
            this.names.push(this.add.text(0, 0, "", { fontFamily: "Arial", fontSize: "12px", color: "#f3f2e9", backgroundColor: "#17262c", padding: { x: 3, y: 2 } }).setOrigin(.5, 0));
          }
          this.game.canvas.setAttribute("aria-hidden", "true");
        }
        update() {
          if (!this.ink) return;
          const { game, time, motion } = state.current, frame = courtFrame(game, time, motion), g = this.ink;
          g.clear();
          frame.spots.forEach((p, i) => {
            const x = 30 + p.x * 10, y = 30 + p.y * 10;
            g.fillStyle(0x000000, .25).fillEllipse(x + 2, y + 6, 30, 18);
            if (i === frame.play.shooter && time > 0 && time < game.duration) g.lineStyle(2, 0xffcd75, .8).strokeCircle(x, y, 19);
            g.fillStyle(i < 5 ? 0x7cd9c4 : 0xed91aa).fillCircle(x, y, 14);
            g.lineStyle(2, 0x10252c).strokeCircle(x, y, 14);
            this.numbers[i].setPosition(x, y);
            const words = game.players[i].name.split(" ");
            this.names[i].setText(`${words[0][0]}. ${words.slice(1).join(" ")}`).setPosition(x, i < 5 ? y + 19 : y - 35);
          });
          const x = 30 + frame.ball.x * 10, y = 30 + frame.ball.y * 10;
          g.fillStyle(0x000000, .3).fillEllipse(x, y + 5, 12, 6);
          g.fillStyle(0xffb65c).fillCircle(x, y - frame.height * 10, 7 + frame.height);
          g.lineStyle(1.5, 0x7a461b).strokeCircle(x, y - frame.height * 10, 7 + frame.height).lineBetween(x - 6, y - frame.height * 10, x + 6, y - frame.height * 10).lineBetween(x, y - frame.height * 10 - 6, x, y - frame.height * 10 + 6);
        }
      }
      instance = new P.Game({ type: P.CANVAS, parent: host.current, width: 1000, height: 560, backgroundColor: "#192c32",
        scale: { mode: P.Scale.FIT, autoCenter: P.Scale.CENTER_BOTH }, scene: Court, audio: { noAudio: true }, banner: false, fps: { target: 30, forceSetTimeOut: true } });
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; instance?.destroy(true); };
  }, [retry]);
  return <div className="sim-court" role="img" aria-label="Animated exhibition basketball court. Score, play descriptions and player stats are available below.">
    <div ref={host} className="sim-canvas" />
    {error && <div className="sim-court-error">Court could not load. <button className="button" onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
  </div>;
}
