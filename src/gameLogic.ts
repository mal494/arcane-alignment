import { ROWS, COLS, ELEMENTS } from './constants';

export type TileData = {
  id: string;
  type: number;
};

let tileIdCounter = 0;
const getNextId = () => `tile_${tileIdCounter++}`;

export const generateValidBoard = (): TileData[][] => {
  const matrix: TileData[][] = Array(ROWS).fill(null).map(() => Array(COLS).fill(null as any));
  const elementIds = Object.keys(ELEMENTS).map(Number);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let validElements = [...elementIds];
      
      if (c >= 2) {
        if (matrix[r][c-1].type === matrix[r][c-2].type) {
          validElements = validElements.filter(e => e !== matrix[r][c-1].type);
        }
      }
      if (r >= 2) {
        if (matrix[r-1][c].type === matrix[r-2][c].type) {
          validElements = validElements.filter(e => e !== matrix[r-1][c].type);
        }
      }

      const randomElement = validElements[Math.floor(Math.random() * validElements.length)];
      matrix[r][c] = { id: getNextId(), type: randomElement };
    }
  }
  return matrix;
};

export const findMatches = (matrix: (TileData | null)[][]) => {
  const matches = new Set<string>();

  // Horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 2; c++) {
      const val = matrix[r][c]?.type;
      if (val && val === matrix[r][c+1]?.type && val === matrix[r][c+2]?.type) {
        matches.add(`${r},${c}`);
        matches.add(`${r},${c+1}`);
        matches.add(`${r},${c+2}`);
      }
    }
  }

  // Vertical
  for (let r = 0; r < ROWS - 2; r++) {
    for (let c = 0; c < COLS; c++) {
      const val = matrix[r][c]?.type;
      if (val && val === matrix[r+1][c]?.type && val === matrix[r+2][c]?.type) {
        matches.add(`${r},${c}`);
        matches.add(`${r+1},${c}`);
        matches.add(`${r+2},${c}`);
      }
    }
  }

  return Array.from(matches).map(m => {
    const [r, c] = m.split(',').map(Number);
    return { r, c };
  });
};

export const applyGravityAndRefill = (matrix: (TileData | null)[][]): TileData[][] => {
  const newMatrix: TileData[][] = Array(ROWS).fill(null).map(() => Array(COLS).fill(null as any));
  const elementIds = Object.keys(ELEMENTS).map(Number);

  for (let c = 0; c < COLS; c++) {
    const column = [];
    for (let r = 0; r < ROWS; r++) {
      if (matrix[r][c] !== null) {
        column.push(matrix[r][c]);
      }
    }

    const numZeros = ROWS - column.length;
    const newColumn = Array(numZeros).fill(null).map(() => ({ id: getNextId(), type: elementIds[Math.floor(Math.random() * elementIds.length)] }));
    const fullColumn = [...newColumn, ...column];

    for (let r = 0; r < ROWS; r++) {
      newMatrix[r][c] = fullColumn[r] as TileData;
    }
  }

  return newMatrix;
};
