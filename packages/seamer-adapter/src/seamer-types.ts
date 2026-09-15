/**
 * Target Seamer Pattern types matching @seamer/pattern-model schema.
 * Realigned to upstream Seamer Studio data model for standalone adapter operation.
 */

export interface SeamerNamedVector {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface SeamerBezierHandle {
  id?: string;
  v1: { x: number; y: number }; // incoming control offset in mm
  v2: { x: number; y: number }; // outgoing control offset in mm
  sameLength: boolean;
  sameAngle: boolean;
}

export interface SeamerPathPoint {
  id: string; // references ConstrainablePoint id
  handle?: SeamerBezierHandle;
}

export interface SeamerConstrainablePoint {
  id: string;
  name: string;
  label?: string | null;
  x: number; // millimeters
  y: number; // millimeters
}

export interface SeamerConstrainablePath {
  id: string;
  name: string;
  label?: string | null;
  pathType: 'line' | 'curve' | 'referenced' | string;
  pathPoints: SeamerPathPoint[];
  basePoint?: string | null;
  version: number;
}

export interface SeamerNotch {
  id?: string;
  position?: number;
  size?: number;
  type?: 'single' | 'double' | 'slit' | 'tee';
}

export interface SeamerPiecePath {
  id: string; // PiecePath id used by seams
  name: string;
  path: string; // ConstrainablePath id
  from: string; // ConstrainablePoint id
  to: string; // ConstrainablePoint id
  reversed: boolean;
  isMirrorLine?: boolean;
  notches: SeamerNotch[];
  seamAllowance?: number;
  showIn3d?: boolean;
}

export interface SeamerPieceArrangement {
  mode: 'curved' | 'flat' | string;
  cylinderName: string;
  uDegrees: number;
  v: number;
  uOffsetMm: number;
  vOffsetMm: number;
  radialOffsetMm: number;
  use2DPosition: boolean;
  positionChanged: boolean;
  matrixWorld: number[];
  position: number[];
}

export interface SeamerPieceSettings3D {
  arrangement: SeamerPieceArrangement;
  enable3d: boolean;
  frozen: boolean;
  flipNormals: boolean;
  filterExternalCollisionsByClothNormal: boolean;
  collisionLayer: number;
  particleDistance?: number | null;
  savedPositions: number[];
}

export interface SeamerPiece {
  id: string;
  name: string;
  label?: string | null;
  type: 'dynamic' | string;
  materialId: string;
  origin: SeamerNamedVector;
  originPoint: string;
  position: { x: number; y: number };
  rotation: number;
  grainVector: SeamerNamedVector;
  rightPieces: number;
  leftPieces: number;
  mirrorLeftPiecesAxis: string;
  mirrorX: boolean;
  mirrorY: boolean;
  seamAllowanceInside: boolean;
  seamAllowance?: number;
  mainPaths: SeamerPiecePath[];
  internalPaths: SeamerPiecePath[];
  settings3d: SeamerPieceSettings3D;
  hideEditorPoints?: boolean;
}

export interface SeamerTextureSlot {
  url: string;
  mediaId: string | null;
  color: string;
  scale: number;
  normalUrl: string;
  normalMediaId: string | null;
  normalMapScale: number;
  opacityUrl: string;
  opacityMediaId: string | null;
  opacityMapScale: number;
}

export interface SeamerMaterial {
  id: string;
  name: string;
  frontTexture: SeamerTextureSlot | null;
  backTexture: SeamerTextureSlot | null;
  useSeparateBackSide: boolean;
  stretchWarpValue: number;
  stretchWeftValue: number;
  bendValue: number;
  thickness: number;
  weight: number;
  roughness: number;
  metalness: number;
  specularIntensity: number;
  opacity: number;
  normalScale: number;
  alphaCutoff: number;
  libraryItemId: string | null;
  libraryVersion: number | null;
  libraryUpdatedAt: string | null;
}

export interface SeamerSeamRef {
  id: string; // PiecePath id
  mirrored: boolean;
  reversed: boolean;
}

export interface SeamerSeam {
  id: string;
  name: string;
  label?: string | null;
  fromPaths: SeamerSeamRef[];
  toPaths: SeamerSeamRef[];
}

export interface SeamerBody {
  fields: Record<string, number>;
  gender: 'female' | 'male' | string;
  unitType: 'imperial' | 'metric' | string;
  bodyColor: string;
  useLegacyDefaultAvatar?: boolean;
}

export interface SeamerPatternSettings3D {
  cameraFov: number;
  cameraPosition: [number, number, number];
  controlsTarget: [number, number, number];
  gravity: [number, number, number];
  avatarEnabled: boolean;
  showAvatar: boolean;
  showArrangementPoints: boolean;
  showTriangles: boolean;
  showSeams: boolean;
  lightingMode: string;
  bokehFStop: number;
  n8aoEnabled: boolean;
  n8aoRadius: number;
  n8aoDistanceFalloff: number;
  n8aoIntensity: number;
  smaaScale: number;
  forceLowEndHardware: boolean;
  handleSelfCollisions: boolean;
  debugFocusPoint: boolean;
}

export interface SeamerPattern {
  id: string;
  name: string;
  description: string;
  lengthUnit: 'inch' | 'cm' | 'mm';
  angleUnit: 'degrees' | 'radians';
  defaultNotchSize: number;
  defaultNotchType?: 'single' | 'double' | 'slit' | 'tee';
  isPublic: boolean;
  pointLabeling: string;
  pointPrefix: string;
  points: SeamerConstrainablePoint[];
  variables: unknown[];
  paths: SeamerConstrainablePath[];
  pieces: SeamerPiece[];
  seams: SeamerSeam[];
  materials: SeamerMaterial[];
  measurements?: unknown[];
  assembly?: unknown;
  seamAllowance: number;
  versionName: string;
  versionId: string;
  versionNumber: number;
  softwareVersion: string;
  currentSize: string;
  images: unknown[];
  frozenSnapshot: unknown | null;
  texts: unknown[];
  body: SeamerBody;
  layers: { id: string; name: string; visible: boolean; locked: boolean; order: number; style: unknown | null }[];
  currentLayerId: string;
  useBodyMeasurementsForSizes: boolean;
  gradingProfile: unknown | null;
  markerSettings: unknown | null;
  graphicsOffset: { x: number; y: number };
  graphicsScale: number;
  enable3d: boolean;
  showCompass: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
  snapToGuides: boolean;
  showPieceNames: boolean;
  showMeasurements?: boolean;
  showConstruction?: boolean;
  viewMode: '2d' | '3d' | 'both';
  interactionMode: string;
  settings3d: SeamerPatternSettings3D;
  hasChanged: boolean;
}
