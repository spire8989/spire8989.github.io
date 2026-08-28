"use strict";

// Canonical lightweight synthesized audio content. The Content Editor edits
// this game-side catalog directly; no binary audio assets are required.
const SYNTH_AUDIO_DEFINITIONS = Object.freeze({
  "musicTracks": {
    forest_encounter: {
      id: "forest_encounter",
      name: "The Forest Awakens",
      bpm: 128,
      loopBeats: 32,
      voices: [
        {
          wave: "triangle",
          gain: 0.13,
          attack: 0.01,
          release: 0.08,
          filter: {
            frequency: 1100,
            q: 0.8
          },
          notes: [
            ["D2", 0, 1],
            ["D2", 1, 0.5],
            ["A2", 1.5, 0.5],
            ["D2", 2, 1],
            ["C2", 3, 1],
            ["Bb1", 4, 1],
            ["Bb1", 5, 0.5],
            ["F2", 5.5, 0.5],
            ["C2", 6, 1],
            ["D2", 7, 1],
            ["D2", 8, 1],
            ["D2", 9, 0.5],
            ["A2", 9.5, 0.5],
            ["F2", 10, 1],
            ["G2", 11, 1],
            ["Bb1", 12, 1],
            ["C2", 13, 1],
            ["D2", 14, 1],
            ["A1", 15, 1],
            ["D2", 16, 1],
            ["D2", 17, 0.5],
            ["A2", 17.5, 0.5],
            ["C2", 18, 1],
            ["D2", 19, 1],
            ["F2", 20, 1],
            ["F2", 21, 0.5],
            ["C3", 21.5, 0.5],
            ["Bb2", 22, 1],
            ["A2", 23, 1],
            ["G2", 24, 1],
            ["Bb2", 25, 1],
            ["C3", 26, 1],
            ["D3", 27, 1],
            ["C3", 28, 1],
            ["Bb2", 29, 1],
            ["A2", 30, 1],
            ["D2", 31, 1]
          ]
        },
        {
          wave: "triangle",
          gain: 0.075,
          attack: 0.01,
          release: 0.08,
          filter: {
            frequency: 1700,
            q: 0.7
          },
          notes: [
            ["D3", 0, 0.5],
            ["A3", 0.5, 0.5],
            ["D4", 1, 0.5],
            ["A3", 1.5, 0.5],
            ["F3", 2, 0.5],
            ["A3", 2.5, 0.5],
            ["C4", 3, 0.5],
            ["A3", 3.5, 0.5],
            ["Bb3", 4, 0.5],
            ["F4", 4.5, 0.5],
            ["D4", 5, 0.5],
            ["F4", 5.5, 0.5],
            ["C4", 6, 0.5],
            ["G4", 6.5, 0.5],
            ["E4", 7, 0.5],
            ["G4", 7.5, 0.5],
            ["D3", 8, 0.5],
            ["A3", 8.5, 0.5],
            ["F4", 9, 0.5],
            ["A3", 9.5, 0.5],
            ["G3", 10, 0.5],
            ["D4", 10.5, 0.5],
            ["Bb3", 11, 0.5],
            ["D4", 11.5, 0.5],
            ["Bb3", 12, 0.5],
            ["F4", 12.5, 0.5],
            ["C4", 13, 0.5],
            ["G4", 13.5, 0.5],
            ["D4", 14, 0.5],
            ["A4", 14.5, 0.5],
            ["C4", 15, 0.5],
            ["A3", 15.5, 0.5],
            ["D3", 16, 0.5],
            ["A3", 16.5, 0.5],
            ["D4", 17, 0.5],
            ["F4", 17.5, 0.5],
            ["C4", 18, 0.5],
            ["G4", 18.5, 0.5],
            ["D4", 19, 0.5],
            ["A4", 19.5, 0.5],
            ["F3", 20, 0.5],
            ["C4", 20.5, 0.5],
            ["F4", 21, 0.5],
            ["A4", 21.5, 0.5],
            ["Bb3", 22, 0.5],
            ["F4", 22.5, 0.5],
            ["D4", 23, 0.5],
            ["F4", 23.5, 0.5],
            ["G3", 24, 0.5],
            ["D4", 24.5, 0.5],
            ["G4", 25, 0.5],
            ["Bb4", 25.5, 0.5],
            ["C4", 26, 0.5],
            ["G4", 26.5, 0.5],
            ["C5", 27, 0.5],
            ["G4", 27.5, 0.5],
            ["C4", 28, 0.5],
            ["F4", 28.5, 0.5],
            ["Bb4", 29, 0.5],
            ["F4", 29.5, 0.5],
            ["A3", 30, 0.5],
            ["E4", 30.5, 0.5],
            ["A4", 31, 0.5],
            ["D4", 31.5, 0.5]
          ]
        },
        {
          wave: "square",
          gain: 0.05,
          attack: 0.015,
          release: 0.12,
          filter: {
            frequency: 2100,
            q: 1
          },
          vibrato: {
            rate: 5.2,
            depth: 7
          },
          notes: [
            ["D5", 0, 1],
            ["F5", 1, 0.5],
            ["G5", 1.5, 0.5],
            ["A5", 2, 1],
            ["F5", 3, 1],
            ["Bb5", 4, 1],
            ["A5", 5, 0.5],
            ["G5", 5.5, 0.5],
            ["F5", 6, 1],
            ["D5", 7, 1],
            ["A5", 8, 1],
            ["C6", 9, 1],
            ["D6", 10, 1],
            ["A5", 11, 1],
            ["Bb5", 12, 0.5],
            ["A5", 12.5, 0.5],
            ["G5", 13, 1],
            ["F5", 14, 0.5],
            ["G5", 14.5, 0.5],
            ["A5", 15, 1],
            ["D6", 16, 1],
            ["C6", 17, 1],
            ["A5", 18, 1],
            ["F5", 19, 1],
            ["A5", 20, 0.5],
            ["Bb5", 20.5, 0.5],
            ["C6", 21, 1],
            ["A5", 22, 1],
            ["F5", 23, 1],
            ["G5", 24, 0.5],
            ["A5", 24.5, 0.5],
            ["Bb5", 25, 1],
            ["D6", 26, 1],
            ["C6", 27, 1],
            ["A5", 28, 1],
            ["G5", 29, 0.5],
            ["F5", 29.5, 0.5],
            ["E5", 30, 0.5],
            ["F5", 30.5, 0.5],
            ["D5", 31, 1]
          ]
        },
        {
          wave: "sine",
          gain: 0.025,
          attack: 0.03,
          release: 0.18,
          notes: [
            ["D6", 3.5, 0.5],
            ["F6", 7.5, 0.5],
            ["A6", 11.5, 0.5],
            ["C6", 15.5, 0.5],
            ["D6", 19.5, 0.5],
            ["F6", 23.5, 0.5],
            ["G6", 27.5, 0.5],
            ["A6", 31.5, 0.5]
          ]
        }
      ]
    },
    camelot_twilight: {
      id: "camelot_twilight",
      name: "Camelot Twilight",
      bpm: 76,
      loopBeats: 32,
      voices: [
        {
          wave: "triangle",
          gain: 0.14,
          attack: 0.05,
          release: 0.28,
          filter: {
            frequency: 900,
            q: 0.7
          },
          notes: [
            ["D2", 0, 4],
            ["A2", 4, 4],
            ["C3", 8, 4],
            ["G2", 12, 4],
            ["D2", 16, 4],
            ["Bb2", 20, 4],
            ["C3", 24, 4],
            ["A2", 28, 4]
          ]
        },
        {
          wave: "triangle",
          gain: 0.075,
          attack: 0.025,
          release: 0.16,
          filter: {
            frequency: 1350,
            q: 0.8
          },
          notes: [
            ["D3", 0, 1],
            ["A3", 1, 1],
            ["F3", 2, 1],
            ["A3", 3, 1],
            ["C3", 4, 1],
            ["G3", 5, 1],
            ["E3", 6, 1],
            ["G3", 7, 1],
            ["Bb2", 8, 1],
            ["F3", 9, 1],
            ["D3", 10, 1],
            ["F3", 11, 1],
            ["C3", 12, 1],
            ["G3", 13, 1],
            ["D3", 14, 1],
            ["G3", 15, 1],
            ["D3", 16, 1],
            ["A3", 17, 1],
            ["F3", 18, 1],
            ["A3", 19, 1],
            ["Bb2", 20, 1],
            ["F3", 21, 1],
            ["D3", 22, 1],
            ["F3", 23, 1],
            ["C3", 24, 1],
            ["G3", 25, 1],
            ["E3", 26, 1],
            ["G3", 27, 1],
            ["A2", 28, 1],
            ["E3", 29, 1],
            ["C3", 30, 1],
            ["E3", 31, 1]
          ]
        },
        {
          wave: "square",
          gain: 0.042,
          attack: 0.035,
          release: 0.22,
          filter: {
            frequency: 1650,
            q: 1
          },
          vibrato: {
            rate: 5.1,
            depth: 8
          },
          notes: [
            ["A4", 0, 1],
            ["C5", 1, 1],
            ["D5", 2, 2],
            ["F5", 4, 1],
            ["E5", 5, 1],
            ["D5", 6, 2],
            ["C5", 8, 1],
            ["D5", 9, 1],
            ["F5", 10, 1],
            ["A5", 11, 1],
            ["G5", 12, 2],
            ["F5", 14, 1],
            ["D5", 15, 1],
            ["A4", 16, 1],
            ["D5", 17, 1],
            ["F5", 18, 2],
            ["G5", 20, 1],
            ["F5", 21, 1],
            ["D5", 22, 1],
            ["C5", 23, 1],
            ["E5", 24, 1],
            ["G5", 25, 1],
            ["A5", 26, 2],
            ["F5", 28, 1],
            ["E5", 29, 1],
            ["D5", 30, 2]
          ]
        },
        {
          wave: "sine",
          gain: 0.032,
          attack: 0.1,
          release: 0.35,
          filter: {
            frequency: 2200,
            q: 0.5
          },
          vibrato: {
            rate: 4.4,
            depth: 5
          },
          notes: [
            ["D5", 3.5, 0.5],
            ["A5", 7.5, 0.5],
            ["F5", 11.5, 0.5],
            ["G5", 15.5, 0.5],
            ["A5", 19.5, 0.5],
            ["D6", 23.5, 0.5],
            ["C6", 27.5, 0.5],
            ["A5", 31.5, 0.5]
          ]
        }
      ]
    },
    moonlit_court: {
      id: "moonlit_court",
      name: "Moonlit Court",
      bpm: 68,
      loopBeats: 32,
      voices: [
        {
          wave: "triangle",
          gain: 0.12,
          attack: 0.12,
          release: 0.45,
          filter: {
            frequency: 720,
            q: 0.8
          },
          notes: [
            ["D2", 0, 4],
            ["Bb1", 4, 4],
            ["C2", 8, 4],
            ["D2", 12, 4],
            ["G1", 16, 4],
            ["Bb1", 20, 4],
            ["C2", 24, 4],
            ["A1", 28, 4]
          ]
        },
        {
          wave: "triangle",
          gain: 0.06,
          attack: 0.06,
          release: 0.3,
          filter: {
            frequency: 1150,
            q: 0.75
          },
          vibrato: {
            rate: 3.8,
            depth: 4
          },
          notes: [
            ["D3", 0, 2],
            ["A3", 2, 2],
            ["Bb3", 4, 2],
            ["F3", 6, 2],
            ["C3", 8, 2],
            ["G3", 10, 2],
            ["D3", 12, 2],
            ["A3", 14, 2],
            ["G3", 16, 2],
            ["D4", 18, 2],
            ["Bb3", 20, 2],
            ["F4", 22, 2],
            ["C4", 24, 2],
            ["G3", 26, 2],
            ["A3", 28, 2],
            ["E4", 30, 2]
          ]
        },
        {
          wave: "square",
          gain: 0.032,
          attack: 0.07,
          release: 0.3,
          filter: {
            frequency: 1350,
            q: 1.3
          },
          vibrato: {
            rate: 5,
            depth: 10
          },
          notes: [
            ["F4", 1, 1],
            ["A4", 3, 1],
            ["D5", 5, 1],
            ["C5", 7, 1],
            ["G4", 9, 1],
            ["Bb4", 11, 1],
            ["A4", 13, 1],
            ["D5", 15, 1],
            ["Bb4", 17, 1],
            ["D5", 19, 1],
            ["F5", 21, 1],
            ["D5", 23, 1],
            ["E5", 25, 1],
            ["C5", 27, 1],
            ["A4", 29, 1],
            ["C#5", 31, 1]
          ]
        },
        {
          wave: "sine",
          gain: 0.028,
          attack: 0.14,
          release: 0.5,
          filter: {
            frequency: 2000,
            q: 0.5
          },
          vibrato: {
            rate: 4.2,
            depth: 6
          },
          notes: [
            ["D5", 2.5, 1],
            ["F5", 6.5, 1],
            ["A5", 10.5, 1],
            ["C6", 14.5, 1],
            ["D6", 18.5, 1],
            ["F5", 22.5, 1],
            ["G5", 26.5, 1],
            ["A5", 30.5, 1]
          ]
        }
      ]
    },
    wisps_of_the_forest: {
      id: "wisps_of_the_forest",
      name: "Wisps of the Forest",
      bpm: 72,
      loopBeats: 32,
      voices: [
        {
          wave: "triangle",
          gain: 0.14,
          attack: 0.08,
          release: 0.3,
          filter: {
            frequency: 900,
            q: 0.8
          },
          notes: [
            ["D2", 0, 4],
            ["D2", 4, 4],
            ["C2", 8, 4],
            ["D2", 12, 4],
            ["Bb1", 16, 4],
            ["C2", 20, 4],
            ["D2", 24, 4],
            ["A1", 28, 4]
          ]
        },
        {
          wave: "triangle",
          gain: 0.07,
          attack: 0.03,
          release: 0.18,
          filter: {
            frequency: 1400,
            q: 0.7
          },
          notes: [
            ["D3", 0, 1],
            ["A3", 2, 1],
            ["F3", 4, 1],
            ["C4", 6, 1],
            ["D3", 8, 1],
            ["G3", 10, 1],
            ["F3", 12, 1],
            ["A3", 14, 1],
            ["Bb2", 16, 1],
            ["F3", 18, 1],
            ["C4", 20, 1],
            ["G3", 22, 1],
            ["D3", 24, 1],
            ["A3", 26, 1],
            ["C4", 28, 1],
            ["F3", 30, 1]
          ]
        },
        {
          wave: "square",
          gain: 0.035,
          attack: 0.04,
          release: 0.22,
          filter: {
            frequency: 1700,
            q: 1.1
          },
          vibrato: {
            rate: 4.8,
            depth: 7
          },
          notes: [
            ["A4", 3, 1],
            ["C5", 7, 1],
            ["F5", 11, 1],
            ["D5", 15, 1],
            ["C5", 19, 1],
            ["G5", 23, 1],
            ["F5", 27, 1],
            ["A4", 31, 1]
          ]
        },
        {
          wave: "sine",
          gain: 0.028,
          attack: 0.12,
          release: 0.35,
          vibrato: {
            rate: 5.4,
            depth: 5
          },
          notes: [
            ["D5", 5.5, 0.5],
            ["A5", 13.5, 0.5],
            ["C6", 21.5, 0.5],
            ["F5", 29.5, 0.5]
          ]
        }
      ]
    },
    rest_lullaby: {
      id: "rest_lullaby",
      name: "Rest by Firelight",
      bpm: 112,
      loopBeats: 12,
      voices: [
        {
          wave: "triangle",
          gain: 0.05,
          attack: 0.025,
          release: 0.16,
          filter: {
            frequency: 1250,
            q: 0.65
          },
          notes: [
            ["D3", 0, 1],
            ["A3", 1, 1],
            ["Bb3", 2, 1],
            ["F3", 3, 1],
            ["G3", 4, 1],
            ["D4", 5, 1],
            ["A3", 6, 1],
            ["C4", 7, 1],
            ["Bb3", 8, 1],
            ["A3", 9, 1],
            ["G3", 10, 1],
            ["D3", 11, 1]
          ]
        },
        {
          wave: "square",
          gain: 0.028,
          attack: 0.025,
          release: 0.18,
          filter: {
            frequency: 1450,
            q: 0.85
          },
          vibrato: {
            rate: 5.1,
            depth: 7
          },
          notes: [
            ["A4", 0, 0.75],
            ["D5", 0.75, 0.75],
            ["F5", 1.5, 1.5],
            ["E5", 3, 0.75],
            ["D5", 3.75, 0.75],
            ["A4", 4.5, 1.5],
            ["Bb4", 6, 0.75],
            ["D5", 6.75, 0.75],
            ["G5", 7.5, 1.5],
            ["F5", 9, 0.75],
            ["E5", 9.75, 0.75],
            ["D5", 10.5, 1.5]
          ]
        },
        {
          wave: "sine",
          gain: 0.032,
          attack: 0.02,
          release: 0.2,
          vibrato: {
            rate: 4.4,
            depth: 4
          },
          notes: [
            ["D6", 0, 0.5],
            ["F6", 1, 0.5],
            ["A6", 2, 0.75],
            ["G6", 4, 0.5],
            ["F6", 5, 0.75],
            ["D6", 6, 0.5],
            ["G6", 7, 0.5],
            ["Bb6", 8, 0.75],
            ["A6", 10, 0.5],
            ["D7", 11, 0.75]
          ]
        }
      ]
    },
    combat_old_forest_battle: {
      id: "combat_old_forest_battle",
      name: "Battle Beneath the Boughs",
      bpm: 158,
      loopBeats: 32,
      voices: [
        {
          wave: "triangle",
          gain: 0.205,
          attack: 0.005,
          release: 0.055,
          filter: {
            frequency: 850,
            q: 0.9
          },
          notes: [
            ["D2", 0, 0.5],
            ["D2", 0.5, 0.5],
            ["A2", 1, 0.5],
            ["D2", 1.5, 0.5],
            ["F2", 2, 0.5],
            ["D2", 2.5, 0.5],
            ["A2", 3, 0.5],
            ["C3", 3.5, 0.5],
            ["Bb1", 4, 0.5],
            ["Bb1", 4.5, 0.5],
            ["F2", 5, 0.5],
            ["Bb1", 5.5, 0.5],
            ["D2", 6, 0.5],
            ["F2", 6.5, 0.5],
            ["G2", 7, 0.5],
            ["A2", 7.5, 0.5],
            ["C2", 8, 0.5],
            ["C2", 8.5, 0.5],
            ["G2", 9, 0.5],
            ["C2", 9.5, 0.5],
            ["E2", 10, 0.5],
            ["G2", 10.5, 0.5],
            ["A2", 11, 0.5],
            ["Bb2", 11.5, 0.5],
            ["D2", 12, 0.5],
            ["A2", 12.5, 0.5],
            ["D3", 13, 0.5],
            ["C3", 13.5, 0.5],
            ["Bb2", 14, 0.5],
            ["A2", 14.5, 0.5],
            ["F2", 15, 0.5],
            ["A2", 15.5, 0.5],
            ["D2", 16, 0.5],
            ["D2", 16.5, 0.5],
            ["A2", 17, 0.5],
            ["D2", 17.5, 0.5],
            ["F2", 18, 0.5],
            ["A2", 18.5, 0.5],
            ["C3", 19, 0.5],
            ["D3", 19.5, 0.5],
            ["G2", 20, 0.5],
            ["G2", 20.5, 0.5],
            ["D3", 21, 0.5],
            ["G2", 21.5, 0.5],
            ["Bb2", 22, 0.5],
            ["D3", 22.5, 0.5],
            ["F3", 23, 0.5],
            ["E3", 23.5, 0.5],
            ["C2", 24, 0.5],
            ["C2", 24.5, 0.5],
            ["G2", 25, 0.5],
            ["C3", 25.5, 0.5],
            ["Bb2", 26, 0.5],
            ["A2", 26.5, 0.5],
            ["G2", 27, 0.5],
            ["E2", 27.5, 0.5],
            ["A1", 28, 0.5],
            ["A1", 28.5, 0.5],
            ["E2", 29, 0.5],
            ["A2", 29.5, 0.5],
            ["C3", 30, 0.5],
            ["Bb2", 30.5, 0.5],
            ["A2", 31, 0.5],
            ["C#3", 31.5, 0.5]
          ]
        },
        {
          wave: "sawtooth",
          gain: 0.052,
          attack: 0.005,
          release: 0.055,
          filter: {
            frequency: 1350,
            q: 1.15
          },
          notes: [
            ["D3", 0, 0.25],
            ["A3", 0.5, 0.25],
            ["D4", 1, 0.25],
            ["A3", 1.5, 0.25],
            ["F3", 2, 0.25],
            ["C4", 2.5, 0.25],
            ["D4", 3, 0.25],
            ["A4", 3.5, 0.25],
            ["Bb3", 4, 0.25],
            ["F4", 4.5, 0.25],
            ["Bb4", 5, 0.25],
            ["F4", 5.5, 0.25],
            ["D4", 6, 0.25],
            ["F4", 6.5, 0.25],
            ["G4", 7, 0.25],
            ["A4", 7.5, 0.25],
            ["C4", 8, 0.25],
            ["G4", 8.5, 0.25],
            ["C5", 9, 0.25],
            ["G4", 9.5, 0.25],
            ["E4", 10, 0.25],
            ["G4", 10.5, 0.25],
            ["A4", 11, 0.25],
            ["Bb4", 11.5, 0.25],
            ["D4", 12, 0.25],
            ["A4", 12.5, 0.25],
            ["D5", 13, 0.25],
            ["C5", 13.5, 0.25],
            ["Bb4", 14, 0.25],
            ["A4", 14.5, 0.25],
            ["F4", 15, 0.25],
            ["A4", 15.5, 0.25],
            ["D4", 16, 0.25],
            ["A4", 16.5, 0.25],
            ["D5", 17, 0.25],
            ["F5", 17.5, 0.25],
            ["A4", 18, 0.25],
            ["C5", 18.5, 0.25],
            ["D5", 19, 0.25],
            ["F5", 19.5, 0.25],
            ["G4", 20, 0.25],
            ["D5", 20.5, 0.25],
            ["G5", 21, 0.25],
            ["D5", 21.5, 0.25],
            ["Bb4", 22, 0.25],
            ["D5", 22.5, 0.25],
            ["F5", 23, 0.25],
            ["E5", 23.5, 0.25],
            ["C4", 24, 0.25],
            ["G4", 24.5, 0.25],
            ["C5", 25, 0.25],
            ["G5", 25.5, 0.25],
            ["Bb4", 26, 0.25],
            ["F5", 26.5, 0.25],
            ["G4", 27, 0.25],
            ["E5", 27.5, 0.25],
            ["A3", 28, 0.25],
            ["E4", 28.5, 0.25],
            ["A4", 29, 0.25],
            ["E5", 29.5, 0.25],
            ["C5", 30, 0.25],
            ["E5", 30.5, 0.25],
            ["A4", 31, 0.25],
            ["C#5", 31.5, 0.25]
          ]
        },
        {
          wave: "square",
          gain: 0.043,
          attack: 0.01,
          release: 0.09,
          filter: {
            frequency: 1850,
            q: 1
          },
          vibrato: {
            rate: 5.6,
            depth: 7
          },
          notes: [
            ["D5", 0, 0.5],
            ["F5", 0.5, 0.5],
            ["A5", 1, 1],
            ["D6", 2, 0.5],
            ["C6", 2.5, 0.5],
            ["A5", 3, 1],
            ["Bb5", 4, 0.5],
            ["D6", 4.5, 0.5],
            ["F6", 5, 1],
            ["D6", 6, 0.5],
            ["C6", 6.5, 0.5],
            ["A5", 7, 1],
            ["G5", 8, 0.5],
            ["C6", 8.5, 0.5],
            ["E6", 9, 1],
            ["G6", 10, 0.5],
            ["F6", 10.5, 0.5],
            ["E6", 11, 1],
            ["D6", 12, 0.5],
            ["F6", 12.5, 0.5],
            ["A6", 13, 0.5],
            ["G6", 13.5, 0.5],
            ["F6", 14, 0.5],
            ["E6", 14.5, 0.5],
            ["D6", 15, 1],
            ["A5", 16, 0.5],
            ["D6", 16.5, 0.5],
            ["F6", 17, 1],
            ["A6", 18, 0.5],
            ["G6", 18.5, 0.5],
            ["F6", 19, 1],
            ["G5", 20, 0.5],
            ["Bb5", 20.5, 0.5],
            ["D6", 21, 0.5],
            ["G6", 21.5, 0.5],
            ["F6", 22, 0.5],
            ["D6", 22.5, 0.5],
            ["Bb5", 23, 1],
            ["C6", 24, 0.5],
            ["E6", 24.5, 0.5],
            ["G6", 25, 1],
            ["F6", 26, 0.5],
            ["E6", 26.5, 0.5],
            ["C6", 27, 1],
            ["A5", 28, 0.5],
            ["C6", 28.5, 0.5],
            ["E6", 29, 0.5],
            ["A6", 29.5, 0.5],
            ["G6", 30, 0.5],
            ["E6", 30.5, 0.5],
            ["C#6", 31, 1]
          ]
        },
        {
          wave: "sine",
          gain: 0.018,
          attack: 0.02,
          release: 0.1,
          filter: {
            frequency: 2100,
            q: 0.5
          },
          vibrato: {
            rate: 4.8,
            depth: 5
          },
          notes: [
            ["A6", 1.75, 0.25],
            ["D7", 3.75, 0.25],
            ["F6", 5.75, 0.25],
            ["A6", 7.75, 0.25],
            ["G6", 9.75, 0.25],
            ["C7", 11.75, 0.25],
            ["A6", 13.75, 0.25],
            ["D7", 15.75, 0.25],
            ["F6", 17.75, 0.25],
            ["A6", 19.75, 0.25],
            ["Bb6", 21.75, 0.25],
            ["G6", 23.75, 0.25],
            ["E6", 25.75, 0.25],
            ["G6", 27.75, 0.25],
            ["A6", 29.75, 0.25],
            ["C#7", 31.75, 0.25]
          ]
        }
      ]
    }
  },
  "sfx": {
    attack_impact: {
      id: "attack_impact",
      name: "Attack Impact",
      duration: 0.12,
      layers: [
        {
          wave: "noise",
          gain: 0.065,
          attack: 0.001,
          release: 0.045,
          duration: 0.07,
          filter: {
            frequency: 1500,
            q: 1.1
          }
        },
        {
          wave: "square",
          startHz: 190,
          endHz: 110,
          gain: 0.04,
          attack: 0.001,
          release: 0.055,
          duration: 0.08,
          filter: {
            frequency: 900,
            q: 0.7
          }
        },
        {
          wave: "sine",
          startHz: 1250,
          endHz: 900,
          gain: 0.025,
          attack: 0.001,
          release: 0.035,
          duration: 0.05
        }
      ]
    },
    pickup_confirm: {
      id: "pickup_confirm",
      name: "Basic Confirm",
      duration: 0.09,
      layers: [
        {
          wave: "square",
          startHz: 660,
          endHz: 690,
          gain: 0.055,
          attack: 0.002,
          release: 0.035,
          duration: 0.055,
          filter: {
            frequency: 2200,
            q: 0.5
          }
        },
        {
          wave: "sine",
          startHz: 990,
          endHz: 990,
          gain: 0.035,
          attack: 0.002,
          release: 0.025,
          start: 0.035,
          duration: 0.045
        }
      ]
    },
    cooking_loop: {
      id: "cooking_loop",
      name: "Cooking Loop",
      duration: 1.4,
      layers: [
        {
          wave: "noise",
          gain: 0.022,
          attack: 0.02,
          release: 0.18,
          start: 0.05,
          duration: 0.3,
          filter: {
            frequency: 1150,
            q: 0.7
          }
        },
        {
          wave: "noise",
          gain: 0.018,
          attack: 0.02,
          release: 0.16,
          start: 0.48,
          duration: 0.24,
          filter: {
            frequency: 1450,
            q: 0.8
          }
        },
        {
          wave: "noise",
          gain: 0.024,
          attack: 0.015,
          release: 0.2,
          start: 0.92,
          duration: 0.32,
          filter: {
            frequency: 1000,
            q: 0.65
          }
        },
        {
          wave: "sine",
          startHz: 310,
          endHz: 220,
          gain: 0.018,
          attack: 0.01,
          release: 0.08,
          start: 0.7,
          duration: 0.12
        }
      ]
    },
    craft_blacksmith_loop: {
      id: "craft_blacksmith_loop",
      name: "Blacksmith Crafting Loop",
      duration: 1.35,
      layers: [
        {
          wave: "sine",
          startHz: 1180,
          endHz: 920,
          gain: 0.055,
          attack: 0.001,
          release: 0.12,
          start: 0.08,
          duration: 0.15
        },
        {
          wave: "sine",
          startHz: 1620,
          endHz: 1050,
          gain: 0.035,
          attack: 0.001,
          release: 0.09,
          start: 0.08,
          duration: 0.12
        },
        {
          wave: "noise",
          gain: 0.035,
          attack: 0.001,
          release: 0.055,
          start: 0.08,
          duration: 0.07,
          filter: {
            frequency: 1900,
            q: 1.2
          }
        },
        {
          wave: "sine",
          startHz: 980,
          endHz: 760,
          gain: 0.05,
          attack: 0.001,
          release: 0.11,
          start: 0.7,
          duration: 0.14
        },
        {
          wave: "sine",
          startHz: 1450,
          endHz: 980,
          gain: 0.03,
          attack: 0.001,
          release: 0.08,
          start: 0.7,
          duration: 0.1
        }
      ]
    },
    craft_potion_loop: {
      id: "craft_potion_loop",
      name: "Potion Making Loop",
      duration: 1.5,
      layers: [
        {
          wave: "sine",
          startHz: 240,
          endHz: 390,
          gain: 0.025,
          attack: 0.02,
          release: 0.09,
          start: 0.1,
          duration: 0.18
        },
        {
          wave: "sine",
          startHz: 330,
          endHz: 510,
          gain: 0.022,
          attack: 0.015,
          release: 0.08,
          start: 0.43,
          duration: 0.15
        },
        {
          wave: "noise",
          gain: 0.016,
          attack: 0.01,
          release: 0.12,
          start: 0.72,
          duration: 0.18,
          filter: {
            frequency: 850,
            q: 1
          }
        },
        {
          wave: "sine",
          startHz: 410,
          endHz: 660,
          gain: 0.021,
          attack: 0.01,
          release: 0.1,
          start: 0.93,
          duration: 0.17
        },
        {
          wave: "triangle",
          startHz: 740,
          endHz: 890,
          gain: 0.018,
          attack: 0.015,
          release: 0.11,
          start: 1.2,
          duration: 0.15,
          filter: {
            frequency: 1500,
            q: 0.6
          }
        }
      ]
    },
    attack_swing: {
      id: "attack_swing",
      name: "Attack Swing",
      duration: 0.16,
      layers: [
        {
          wave: "sawtooth",
          startHz: 520,
          endHz: 180,
          gain: 0.045,
          attack: 0.002,
          release: 0.07,
          duration: 0.13,
          filter: {
            frequency: 1800,
            q: 0.8
          }
        },
        {
          wave: "noise",
          gain: 0.035,
          attack: 0.002,
          release: 0.06,
          duration: 0.09,
          filter: {
            frequency: 2400,
            q: 0.5
          }
        }
      ]
    },
    item_uncommon: {
      id: "item_uncommon",
      name: "Uncommon Item Found",
      duration: 0.42,
      layers: [
        {
          wave: "triangle",
          startHz: 523.25,
          endHz: 523.25,
          gain: 0.045,
          attack: 0.004,
          release: 0.11,
          start: 0,
          duration: 0.13
        },
        {
          wave: "triangle",
          startHz: 659.25,
          endHz: 659.25,
          gain: 0.045,
          attack: 0.004,
          release: 0.11,
          start: 0.11,
          duration: 0.13
        },
        {
          wave: "sine",
          startHz: 783.99,
          endHz: 783.99,
          gain: 0.055,
          attack: 0.004,
          release: 0.18,
          start: 0.22,
          duration: 0.19
        },
        {
          wave: "sine",
          startHz: 1567.98,
          endHz: 1567.98,
          gain: 0.018,
          attack: 0.003,
          release: 0.12,
          start: 0.23,
          duration: 0.15
        }
      ]
    },
    craft_cloth_loop: {
      id: "craft_cloth_loop",
      name: "Cloth Crafting Loop",
      duration: 1.5,
      layers: [
        {
          wave: "noise",
          gain: 0.018,
          attack: 0.005,
          release: 0.07,
          start: 0.08,
          duration: 0.09,
          filter: {
            frequency: 2300,
            q: 1.2
          }
        },
        {
          wave: "triangle",
          startHz: 520,
          endHz: 430,
          gain: 0.018,
          attack: 0.003,
          release: 0.06,
          start: 0.11,
          duration: 0.08
        },
        {
          wave: "noise",
          gain: 0.024,
          attack: 0.02,
          release: 0.14,
          start: 0.5,
          duration: 0.24,
          filter: {
            frequency: 1250,
            q: 0.45
          }
        },
        {
          wave: "triangle",
          startHz: 330,
          endHz: 390,
          gain: 0.016,
          attack: 0.01,
          release: 0.08,
          start: 0.78,
          duration: 0.11
        },
        {
          wave: "noise",
          gain: 0.015,
          attack: 0.004,
          release: 0.06,
          start: 1.12,
          duration: 0.08,
          filter: {
            frequency: 2600,
            q: 1.3
          }
        },
        {
          wave: "sine",
          startHz: 620,
          endHz: 570,
          gain: 0.015,
          attack: 0.003,
          release: 0.08,
          start: 1.15,
          duration: 0.09
        }
      ]
    },
    coins_transaction: {
      id: "coins_transaction",
      name: "Coins Up",
      duration: 0.3,
      layers: [
        {
          wave: "sine",
          startHz: 720,
          endHz: 840,
          gain: 0.035,
          attack: 0.001,
          release: 0.07,
          start: 0,
          duration: 0.08
        },
        {
          wave: "triangle",
          startHz: 940,
          endHz: 1080,
          gain: 0.038,
          attack: 0.001,
          release: 0.075,
          start: 0.055,
          duration: 0.085
        },
        {
          wave: "sine",
          startHz: 1220,
          endHz: 1410,
          gain: 0.042,
          attack: 0.001,
          release: 0.08,
          start: 0.11,
          duration: 0.09
        },
        {
          wave: "sine",
          startHz: 1580,
          endHz: 1840,
          gain: 0.036,
          attack: 0.001,
          release: 0.09,
          start: 0.17,
          duration: 0.1
        },
        {
          wave: "noise",
          gain: 0.01,
          attack: 0.001,
          release: 0.055,
          start: 0.04,
          duration: 0.16,
          filter: {
            frequency: 3000,
            q: 1.1
          }
        }
      ]
    }
  }
});
