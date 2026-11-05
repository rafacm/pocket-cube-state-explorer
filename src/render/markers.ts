// The selection and hover boxes, and the tubes along highlighted routes. Both keep a constant size on
// screen, scaled by their distance from the camera.
import * as THREE from 'three';
import type { Explorer, Point } from '../explorer/types';
import { dotPoint } from '../explorer/locate';
import { focalPx } from './scene';

const up = new THREE.Vector3(0, 1, 0), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

export function placeMarkers(x: Explorer): void {
  const gs = x.gs, cam = gs.cam, s = x.sel;
  const focal = focalPx(cam, x.el.graph.clientHeight || 600);
  const S = s.on ? (s.node || (s.dot && dotPoint(x, s.dot.code))) : null;
  const camD = (o: Point) => Math.hypot(o.x - cam.position.x, o.y - cam.position.y, o.z - cam.position.z);
  if (S) { gs.selMark.visible = true; gs.selMark.position.set(S.x, S.y, S.z); gs.selMark.scale.setScalar(Math.max(S.size * 1.55, camD(S) * 14 / focal)); }
  else gs.selMark.visible = false;
  const hover = x.pointer.hover;
  if (hover && hover !== s.node) { gs.hovMark.visible = true; gs.hovMark.position.set(hover.x, hover.y, hover.z); gs.hovMark.scale.setScalar(hover.size * 1.35); }
  else gs.hovMark.visible = false;
  const hl = s.highlight, tubes = gs.tubes;
  let k = 0;
  for (; k < hl.length && k < tubes.length; k++) {
    const [a, b, m, th] = hl[k], t = tubes[k];
    tmpA.set(a.x, a.y, a.z); tmpB.set(b.x, b.y, b.z);
    const len = tmpA.distanceTo(tmpB);
    t.material = gs.tubeMats[m];
    t.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
    t.quaternion.setFromUnitVectors(up, tmpB.sub(tmpA).normalize());
    // constant width on screen: about 3 px for a normal route, whatever the zoom
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, uu = ux * ux + uy * uy + uz * uz || 1;
    const cpx = cam.position.x - a.x, cpy = cam.position.y - a.y, cpz = cam.position.z - a.z;
    const tt = Math.max(0, Math.min(1, (cpx * ux + cpy * uy + cpz * uz) / uu));
    const md = Math.hypot(cpx - ux * tt, cpy - uy * tt, cpz - uz * tt);
    const th2 = (th / 0.55) * 1.5 * md / focal;
    t.scale.set(th2, len, th2); t.visible = true;
  }
  for (; k < tubes.length; k++) if (tubes[k].visible) tubes[k].visible = false;
}
