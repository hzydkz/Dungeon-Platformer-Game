import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../src/config/movement';
import { PlayerMotor, type MotorInput } from '../src/core/movement/motor';

const DT = 1 / 60;
const idle: MotorInput = { moveX: 0, jumpPressed: false, jumpHeld: false };
const press: MotorInput = { moveX: 0, jumpPressed: true, jumpHeld: true };
const hold: MotorInput = { moveX: 0, jumpPressed: false, jumpHeld: true };

describe('PlayerMotor', () => {
  it('땅에서 점프하면 설정값의 초속으로 뛴다', () => {
    const m = new PlayerMotor(MOVEMENT);
    const r = m.step(DT, press, true, 0);
    expect(r.jumped).toBe(true);
    expect(r.vy).toBe(-MOVEMENT.jumpVelocity);
  });

  it('공중에서는 코요테 타임이 지나면 점프할 수 없다', () => {
    const m = new PlayerMotor(MOVEMENT);
    m.step(DT, idle, true, 0);
    let t = 0;
    while (t < MOVEMENT.coyoteTime + 0.02) {
      m.step(DT, idle, false, 10);
      t += DT;
    }
    expect(m.step(DT, press, false, 10).jumped).toBe(false);
  });

  it('코요테 타임 안에는 발판을 벗어나도 점프할 수 있다', () => {
    const m = new PlayerMotor(MOVEMENT);
    m.step(DT, idle, true, 0);
    m.step(DT, idle, false, 10);
    m.step(DT, idle, false, 20);
    expect(m.step(DT, press, false, 30).jumped).toBe(true);
  });

  it('점프 버퍼: 착지 직전에 누른 점프가 착지 순간 실행된다', () => {
    const m = new PlayerMotor(MOVEMENT);
    for (let i = 0; i < 20; i++) m.step(DT, idle, false, 100);
    expect(m.step(DT, press, false, 100).jumped).toBe(false);
    m.step(DT, hold, false, 100);
    expect(m.step(DT, hold, true, 0).jumped).toBe(true);
  });

  it('점프 버퍼가 만료되면 실행되지 않는다', () => {
    const m = new PlayerMotor(MOVEMENT);
    for (let i = 0; i < 20; i++) m.step(DT, idle, false, 100);
    m.step(DT, press, false, 100);
    for (let t = 0; t < MOVEMENT.jumpBufferTime + 0.02; t += DT) m.step(DT, hold, false, 100);
    expect(m.step(DT, hold, true, 0).jumped).toBe(false);
  });

  it('가변 점프: 상승 중 키를 떼면 상승 속도가 설정 비율로 줄어든다 (한 번만)', () => {
    const m = new PlayerMotor(MOVEMENT);
    m.step(DT, press, true, 0);
    const r = m.step(DT, idle, false, -300);
    expect(r.vy).toBeCloseTo(-300 * MOVEMENT.jumpCutMultiplier);
    expect(m.step(DT, idle, false, -100).vy).toBe(-100);
  });

  it('하강 중에는 키를 떼도 속도가 바뀌지 않는다', () => {
    const m = new PlayerMotor(MOVEMENT);
    m.step(DT, press, true, 0);
    m.step(DT, hold, false, 50);
    expect(m.step(DT, idle, false, 60).vy).toBe(60);
  });

  it('달리기 속도와 이동속도 배율, 최대 낙하 속도', () => {
    const m = new PlayerMotor(MOVEMENT, 0.9);
    const r = m.step(DT, { moveX: 1, jumpPressed: false, jumpHeld: false }, false, 9999);
    expect(r.vx).toBeCloseTo(MOVEMENT.runSpeed * 0.9);
    expect(r.vy).toBe(MOVEMENT.maxFallSpeed);
    expect(m.step(DT, { moveX: -5, jumpPressed: false, jumpHeld: false }, true, 0).vx).toBeCloseTo(-MOVEMENT.runSpeed * 0.9);
  });

  it('땅에 붙어 있는 동안 점프는 한 번만 일어난다 (연속 점프 없음)', () => {
    const m = new PlayerMotor(MOVEMENT);
    expect(m.step(DT, press, true, 0).jumped).toBe(true);
    expect(m.step(DT, hold, true, -320).jumped).toBe(false);
  });
});
