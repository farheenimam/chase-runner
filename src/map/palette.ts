import { Box3, Color, Mesh, MeshStandardMaterial, Object3D, Vector3 } from "three";

/**
 * The exported map carries no colour: every one of its 185 materials has
 * `baseColorFactor = [0,0,0,1]` and there are no textures (the Blender node
 * setups did not survive the glTF export, and the source .blend is not in the
 * repo). The material names did survive, and they are descriptive, so the
 * palette is rebuilt here from the names.
 *
 * Rules are ordered — the first substring match wins, so put specific tokens
 * (`Sign_Red`) above generic ones (`Sign`).
 */
const RULES: [test: RegExp, colour: number][] = [
  // --- gameplay tile colours; these must stay clearly distinguishable -------
  [/^Tile_Red/i, 0xd6392f],
  [/^Tile_Orange/i, 0xe8802a],
  [/^Tile_Yellow/i, 0xefc233],
  [/^Tile_Green/i, 0x4aa657],
  [/^Tile_Cyan/i, 0x3fb8bf],
  [/^Tile_Blue/i, 0x3566c4],
  [/^Tile_Purple/i, 0x7a4bbd],
  [/^Tile_Magenta/i, 0xc63f95],

  // --- ground -------------------------------------------------------------
  [/Grass_Shade_1/i, 0x6d9b44],
  [/Grass_Shade_2/i, 0x5f8f3f],
  [/Grass_Shade_3/i, 0x6f9f47],
  [/Grass_Shade_4/i, 0x7aa851],
  [/Grass_Shade_5/i, 0x86b25c],
  [/IslandGrass|LawnBase|Grass/i, 0x6b9c46],
  [/Asphalt|Carriageway/i, 0x3b3f45],
  [/LineWhite|Dot_White|Track_Line/i, 0xe9ecef],
  [/Curb|Kerb|Nosing|Curb_Stone/i, 0xbdb7ac],
  [/Sidewalk|Paving_Light|Footpath_Paving|PlazaPave|Alley_Paving/i, 0xc9c3b6],
  [/Paving_Dark|Footpath_Joint|PlazaJoint|Alley_Joint/i, 0x9d978b],
  [/Track_Red/i, 0xb4553f],
  [/PlaySand/i, 0xe0cf9f],
  [/Soil|Mulch/i, 0x5a4433],
  [/GroundBase|Placeholder_Ground/i, 0x6f8f52],
  [/Stone|Limestone|ConcRiser|ConcWall|ConcStep|StageTop/i, 0xbfb9ac],

  // --- water --------------------------------------------------------------
  [/Water_Foam|Foam/i, 0xeaf4f7],
  [/Water/i, 0x4f8fb0],

  // --- buildings ----------------------------------------------------------
  [/Wall_Tan|Wall_Warm|Coursing|BaseCourse/i, 0xc4a984],
  [/Wall_Grey|Wall_DarkGray|Parapet|Ledge|StoneTrim|Cornice/i, 0x9c9a94],
  [/Roof_A|Roof_B|Roof_C|Roof_D|RoofTerrace|StairHead|Penthouse/i, 0x6b6560],
  [/Roof_Shingle/i, 0x7d4a3a],
  [/Roof_Pink/i, 0xc98a92],
  [/RoofGreen|RoofPlanter|PlanterGreen|Pergola|Hedge|Shrub|Plant/i, 0x4f7c46],
  [/Window|WinGlass|ShopGlass|Glass|Louvre/i, 0x8fb6cc],
  [/WinLit|Sconce|Lamp_Head|LampHead|Floodlight|Fixture|BollardLit/i, 0xffe9b0],
  [/WinFrame|Shopfront|Canopy(?!Shadow)|SignBand|Frame/i, 0x8a7f72],
  [/Sign_Red/i, 0xcf3b34],
  [/Sign_Blu/i, 0x3667b8],
  [/Sign_Ylw|Flag_Yellow|Slide_Yellow|Rung_Yellow|Sail_Yellow/i, 0xe8c341],
  [/Sign_Org|Sail_Orange/i, 0xdd8235],
  [/SignText|Banner_Black|Iron_Black|Rubber_Black|Ink/i, 0x24262a],
  [/ServiceDoor|Shutter/i, 0x74797e],

  // --- vehicles and street furniture --------------------------------------
  [/Car_Tyre/i, 0x22242a],
  [/Car_Glass|Bus_Window/i, 0x9dbccd],
  [/Car_Blue|Tower_Blue|Sail_Blue/i, 0x2f5fb0],
  [/Car_Red|Slide_Red|PlayEdge_Red|SignalRed|Hold_Red/i, 0xc4382f],
  [/Car_White/i, 0xe6e6e6],
  [/Car_Tan|Rope_Tan|Cushion_Beige/i, 0xc9ab84],
  [/Car_Silver|Steel|Steel_Light|Bronze|ChampagneGold|MastBase/i, 0xa9adb2],
  [/Car_Dark/i, 0x3a3f47],
  [/Bus_Yellow/i, 0xe3b02c],
  [/Bus_Trim|BusStop_Frame|BusStop_Roof|Railing|Bollard|Pole|Grate|Bin/i, 0x565b61],
  [/SignalGreen|Hold_Green|Spinner_Green|Cushion_ForestGreen/i, 0x3f9a4a],
  [/SignalAmber/i, 0xe0a02a],
  [/SignalHousing|Dumpster|BinLid|Pipe|Crate/i, 0x4a5057],

  // --- planting -----------------------------------------------------------
  [/Leaf|Canopy|BushShade_1/i, 0x4e7f3e],
  [/BushShade_2/i, 0x568a45],
  [/BushShade_3/i, 0x5f954c],
  [/BushShade_4/i, 0x679d53],
  [/LeafHighlight/i, 0x7fb35f],
  [/Trunk|Teak|Oak|Walnut|Wood|Deck|PalmTrunk/i, 0x6b4b32],
  [/PalmFrond/i, 0x4f8a3c],
  [/CanopyShadow/i, 0x2f5228],
  [/Flower_Pink|Dot_Pink|Rose/i, 0xd96a9a],
  [/Flower_Yellow|Dot_Yellow|Hold_Yellow/i, 0xe9cd52],
  [/Flower_White|WhiteRose/i, 0xf1f0ea],
  [/Flower_Purple|Lavender/i, 0x8f6fc0],
  [/Cushion_Olive/i, 0x8a8a4e],
  [/Hold_Blue/i, 0x3566c4],
  [/Char_Hair/i, 0x2b2320],
  [/Char_Body/i, 0xe8c3a0],
  [/Rider_/i, 0xc98f5a],
];

const FALLBACK = 0xb0aca4;
const PARK_BOUNDS = new Box3(
  new Vector3(-45, -60, -Infinity),
  new Vector3(45, 60, Infinity),
);
const OUTSIDE_PARK_BRIGHTNESS = 1.2;

export function colourForMaterial(name: string): number {
  for (const [test, colour] of RULES) if (test.test(name)) return colour;
  return FALLBACK;
}

/**
 * Rewrites every material in the map to a flat lit colour. Materials are shared
 * across thousands of nodes, so this touches each one once.
 */
export function applyPalette(root: Object3D, tileColourOf?: (o: Object3D) => string | null) {
  const seen = new Set<MeshStandardMaterial>();
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const tileColour = tileColourOf?.(mesh);
    if (tileColour) {
      // Tiles carry their colour in the name, and tiles of different colours
      // share materials — each tile needs its own material instance.
      const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
        | MeshStandardMaterial
        | undefined;
      if (!src) return;
      const own = src.clone();
      own.color = new Color(colourForMaterial(`Tile_${tileColour}`));
      if (!new Box3().setFromObject(mesh).intersectsBox(PARK_BOUNDS)) {
        own.color.multiplyScalar(OUTSIDE_PARK_BRIGHTNESS);
      }
      own.roughness = 0.85;
      own.metalness = 0;
      mesh.material = own;
      return;
    }
    const outsidePark = !new Box3().setFromObject(mesh).intersectsBox(PARK_BOUNDS);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = (mats as MeshStandardMaterial[]).map((m) => {
      if (!m) return m;
      if (outsidePark) {
        const own = m.clone();
        own.color = new Color(colourForMaterial(m.name)).multiplyScalar(
          OUTSIDE_PARK_BRIGHTNESS,
        );
        own.roughness = 0.9;
        own.metalness = 0;
        return own;
      }
      if (!seen.has(m)) {
        seen.add(m);
        m.color = new Color(colourForMaterial(m.name));
        m.roughness = 0.9;
        m.metalness = 0;
      }
      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
}
