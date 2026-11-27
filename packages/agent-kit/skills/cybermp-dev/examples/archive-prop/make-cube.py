"""Generate original hard-edged diagnostic geometry as a glTF binary."""

import argparse
import json
import struct
from pathlib import Path


# Four independent vertices per face preserve hard normals.
FACES = [
    ((1, 0, 0), [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)]),
    ((-1, 0, 0), [(-1, 1, -1), (-1, -1, -1), (-1, -1, 1), (-1, 1, 1)]),
    ((0, 1, 0), [(1, 1, -1), (-1, 1, -1), (-1, 1, 1), (1, 1, 1)]),
    ((0, -1, 0), [(-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)]),
    ((0, 0, 1), [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]),
    ((0, 0, -1), [(-1, 1, -1), (1, 1, -1), (1, -1, -1), (-1, -1, -1)]),
]


def make_cube() -> bytes:
    positions = bytearray()
    normals = bytearray()
    tangents = bytearray()
    texcoords = bytearray()
    indices = bytearray()
    for face_index, (normal, corners) in enumerate(FACES):
        tangent = [0.5 * (end - start) for start, end in zip(corners[0], corners[1])]
        uv_corners = [(0, 0), (1, 0), (1, 1), (0, 1)]
        for (x, y, z), uv in zip(corners, uv_corners):
            positions.extend(struct.pack("<3f", x * 0.4, y * 0.4, z * 0.4))
            normals.extend(struct.pack("<3f", *normal))
            tangents.extend(struct.pack("<4f", *tangent, 1))
            texcoords.extend(struct.pack("<2f", *uv))
        start = 4 * face_index
        indices.extend(struct.pack("<6H", start, start + 1, start + 2, start, start + 2, start + 3))
    chunks = [positions, normals, tangents, texcoords, indices]
    sizes = list(map(len, chunks))
    binary = b"".join(chunks)
    extent = struct.unpack("<f", struct.pack("<f", 0.4))[0]
    doc = {
        "asset": {"version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "submesh_01"}],
        "meshes": [{"primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1, "TANGENT": 2, "TEXCOORD_0": 3},
            "indices": 4,
        }]}],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": sum(sizes[:index]), "byteLength": size, "target": target}
            for index, (size, target) in enumerate(zip(sizes, [34962, 34962, 34962, 34962, 34963]))
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 24, "type": "VEC3",
             "min": [-extent] * 3, "max": [extent] * 3},
            {"bufferView": 1, "componentType": 5126, "count": 24, "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": 24, "type": "VEC4"},
            {"bufferView": 3, "componentType": 5126, "count": 24, "type": "VEC2"},
            {"bufferView": 4, "componentType": 5123, "count": 36, "type": "SCALAR"},
        ],
    }
    encoded = json.dumps(doc, separators=(",", ":")).encode("ascii")
    encoded += b" " * (-len(encoded) % 4)
    chunks = struct.pack("<I4s", len(encoded), b"JSON") + encoded
    chunks += struct.pack("<I4s", len(binary), b"BIN\x00") + binary
    return struct.pack("<4sII", b"glTF", 2, 12 + len(chunks)) + chunks


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    path = parser.parse_args().output
    path.write_bytes(make_cube())
