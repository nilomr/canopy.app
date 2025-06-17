import * as shapefile from 'shapefile';

export interface CrownPolygon {
  type: 'Polygon';
  coordinates: number[][][];
  properties: any;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export async function loadCrownShapefile(shapefilePath: string, bounds: Bounds): Promise<CrownPolygon[]> {
  try {
    // Load both .shp and .dbf files
    const shpPath = shapefilePath;
    const dbfPath = shapefilePath.replace('.shp', '.dbf');
    
    console.log('Loading shapefile:', shpPath);
    console.log('Loading attribute file:', dbfPath);
    
    const [shpResponse, dbfResponse] = await Promise.all([
      fetch(shpPath),
      fetch(dbfPath)
    ]);
    
    if (!shpResponse.ok) {
      throw new Error(`Failed to load shapefile: ${shpResponse.status}`);
    }
    
    if (!dbfResponse.ok) {
      console.warn(`Failed to load DBF file: ${dbfResponse.status}. Proceeding without attributes.`);
      // Fallback to geometry-only loading
      return loadGeometryOnly(await shpResponse.arrayBuffer(), bounds);
    }
    
    const [shpBuffer, dbfBuffer] = await Promise.all([
      shpResponse.arrayBuffer(),
      dbfResponse.arrayBuffer()
    ]);

    const crowns: CrownPolygon[] = [];

    // Read shapefile with both geometry and attributes
    await shapefile.read(shpBuffer, dbfBuffer).then((collection) => {
      console.log('Loaded shapefile with', collection.features.length, 'features');
      
      // Debug: log first feature properties
      if (collection.features.length > 0) {
        console.log('First feature properties:', collection.features[0].properties);
        console.log('Property keys:', Object.keys(collection.features[0].properties || {}));
      }
      
      collection.features.forEach((feature) => {
        if (feature.geometry && feature.geometry.type === 'Polygon') {
          // Crop each ring to the bounds
          const croppedCoords = feature.geometry.coordinates
            .map(ring => clipPolygonToBounds(ring, bounds))
            .filter(ring => ring.length > 2); // valid polygon ring

          if (croppedCoords.length > 0) {
            crowns.push({
              type: 'Polygon',
              coordinates: croppedCoords,
              properties: feature.properties || {}
            });
          }
        }
      });
    });

    console.log('Processed', crowns.length, 'crown polygons');
    return crowns;
  } catch (error) {
    console.error('Failed to load shapefile:', error);
    return [];
  }
}

// Fallback function for geometry-only loading
async function loadGeometryOnly(shpBuffer: ArrayBuffer, bounds: Bounds): Promise<CrownPolygon[]> {
  const crowns: CrownPolygon[] = [];
  
  await shapefile.read(shpBuffer).then((collection) => {
    collection.features.forEach((feature) => {
      if (feature.geometry && feature.geometry.type === 'Polygon') {
        const croppedCoords = feature.geometry.coordinates
          .map(ring => clipPolygonToBounds(ring, bounds))
          .filter(ring => ring.length > 2);

        if (croppedCoords.length > 0) {
          crowns.push({
            type: 'Polygon',
            coordinates: croppedCoords,
            properties: {} // Empty properties for geometry-only
          });
        }
      }
    });
  });
  
  return crowns;
}

// Sutherland–Hodgman polygon clipping for a rectangle
function clipPolygonToBounds(polygon: number[][], bounds: Bounds): number[][] {
  let output = polygon;
  // left (minX)
  output = clipEdge(output, ([x, y]) => x >= bounds.minX, ([x1, y1], [x2, y2]) => {
    const t = (bounds.minX - x1) / (x2 - x1);
    return [bounds.minX, y1 + t * (y2 - y1)];
  });
  // right (maxX)
  output = clipEdge(output, ([x, y]) => x <= bounds.maxX, ([x1, y1], [x2, y2]) => {
    const t = (bounds.maxX - x1) / (x2 - x1);
    return [bounds.maxX, y1 + t * (y2 - y1)];
  });
  // bottom (minY)
  output = clipEdge(output, ([x, y]) => y >= bounds.minY, ([x1, y1], [x2, y2]) => {
    const t = (bounds.minY - y1) / (y2 - y1);
    return [x1 + t * (x2 - x1), bounds.minY];
  });
  // top (maxY)
  output = clipEdge(output, ([x, y]) => y <= bounds.maxY, ([x1, y1], [x2, y2]) => {
    const t = (bounds.maxY - y1) / (y2 - y1);
    return [x1 + t * (x2 - x1), bounds.maxY];
  });
  return output;
}

function clipEdge(
  polygon: number[][],
  inside: (pt: number[]) => boolean,
  intersect: (a: number[], b: number[]) => number[]
): number[][] {
  const output: number[][] = [];
  if (polygon.length === 0) return output;
  let prev = polygon[polygon.length - 1];
  let prevInside = inside(prev);
  for (const curr of polygon) {
    const currInside = inside(curr);
    if (currInside) {
      if (!prevInside) {
        output.push(intersect(prev, curr));
      }
      output.push(curr);
    } else if (prevInside) {
      output.push(intersect(prev, curr));
    }
    prev = curr;
    prevInside = currInside;
  }
  return output;
}

export function projectToPixels(
  coordinates: number[][][],
  imageBounds: number[][],
  imageWidth: number,
  imageHeight: number
): number[][][] {
  // imageBounds format: [[minLat, minLon], [maxLat, maxLon]]
  // But coordinates are [lon, lat] format
  const [southWest, northEast] = imageBounds;
  const [minLat, minLon] = southWest;
  const [maxLat, maxLon] = northEast;

  return coordinates.map(ring =>
    ring.map(([x, y]) => [
      ((x - minLon) / (maxLon - minLon)) * imageWidth,
      ((maxLat - y) / (maxLat - minLat)) * imageHeight
    ])
  );
}
