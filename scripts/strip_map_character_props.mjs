import fs from "node:fs";

const inputPath = process.argv[2] ?? "public/models/map.glb";
const outputPath = process.argv[3] ?? inputPath;
const data = fs.readFileSync(inputPath);
if (data.readUInt32LE(0) !== 0x46546c67) throw new Error("Not a GLB file");

const jsonLength = data.readUInt32LE(12);
const jsonStart = 20;
const jsonText = data.subarray(jsonStart, jsonStart + jsonLength).toString("utf8").trim();
const gltf = JSON.parse(jsonText);
const nodes = gltf.nodes ?? [];
const isCharacterNode = (name = "") =>
  /^Prop_(?:Runner|Chaser)(?:_|$)/i.test(name) ||
  /^(?:Runner|Chaser)_(?:Body|Face|Hair|Eye|Eyes)(?:_|$)/i.test(name);
const removed = new Set();

function collect(index) {
  if (removed.has(index)) return;
  removed.add(index);
  for (const child of nodes[index]?.children ?? []) collect(child);
}

nodes.forEach((node, index) => {
  if (isCharacterNode(node.name)) collect(index);
});
if (removed.size === 0) {
  console.log("No baked runner/chaser character nodes found.");
  process.exit(0);
}

for (const scene of gltf.scenes ?? []) {
  scene.nodes = (scene.nodes ?? []).filter((index) => !removed.has(index));
}
for (const node of nodes) {
  if (node.children) node.children = node.children.filter((index) => !removed.has(index));
}

const keptNodes = nodes.filter((_, index) => !removed.has(index));
const nodeIndex = new Map();
nodes.forEach((_, index) => {
  if (!removed.has(index)) nodeIndex.set(index, nodeIndex.size);
});
for (const scene of gltf.scenes ?? []) {
  scene.nodes = (scene.nodes ?? []).map((index) => nodeIndex.get(index));
}
for (const node of keptNodes) {
  if (node.children) node.children = node.children.map((index) => nodeIndex.get(index));
}
gltf.nodes = keptNodes;
for (const mesh of gltf.meshes ?? []) {
  if (/^(?:Runner|Chaser)_(?:Body|Face|Hair|Eye|Eyes)(?:_|$)/i.test(mesh.name ?? "")) {
    delete mesh.name;
  }
}

const json = Buffer.from(JSON.stringify(gltf));
const paddedJsonLength = Math.ceil(json.length / 4) * 4;
const paddedJson = Buffer.concat([json, Buffer.alloc(paddedJsonLength - json.length, 0x20)]);
const bin = data.subarray(jsonStart + jsonLength);
const output = Buffer.alloc(12 + 8 + paddedJson.length + bin.length);
output.writeUInt32LE(0x46546c67, 0);
output.writeUInt32LE(2, 4);
output.writeUInt32LE(output.length, 8);
output.writeUInt32LE(paddedJson.length, 12);
output.writeUInt32LE(0x4e4f534a, 16);
paddedJson.copy(output, 20);
bin.copy(output, 20 + paddedJson.length);
fs.writeFileSync(outputPath, output);
console.log(`Removed ${removed.size} baked character nodes from ${outputPath}`);
