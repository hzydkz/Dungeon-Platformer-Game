/**
 * 플레이어 이동 규칙 (Phaser 비의존).
 * 게임의 Player와 맵 도달성 시뮬레이터가 같은 규칙을 쓴다.
 * 중력 적분은 호출 측(Arcade Physics 또는 시뮬레이터)이 한다.
 */

export interface MotorParams {
  readonly gravity: number;
  readonly jumpVelocity: number;
  readonly runSpeed: number;
  readonly maxFallSpeed: number;
  readonly jumpCutMultiplier: number;
  readonly coyoteTime: number;
  readonly jumpBufferTime: number;
}

export interface MotorInput {
  /** -1(왼쪽) ~ 1(오른쪽) */
  readonly moveX: number;
  /** 이번 프레임에 점프 키를 새로 눌렀는가 */
  readonly jumpPressed: boolean;
  /** 점프 키를 누르고 있는가 */
  readonly jumpHeld: boolean;
}

export interface MotorResult {
  readonly vx: number;
  readonly vy: number;
  readonly jumped: boolean;
}

export class PlayerMotor {
  private coyote = 0;
  private buffer = 0;
  private canCut = false;

  constructor(
    private readonly params: MotorParams,
    /** 이동속도 배율 (특성 등). 점프 높이는 바꾸지 않는다. */
    public speedMultiplier = 1,
  ) {}

  reset(): void {
    this.coyote = 0;
    this.buffer = 0;
    this.canCut = false;
  }

  /** 현재 세로 속도 vy(아래가 +)와 접지 여부로 이번 프레임의 목표 속도를 계산한다. */
  step(dt: number, input: MotorInput, onGround: boolean, vy: number): MotorResult {
    const p = this.params;
    this.coyote = onGround ? p.coyoteTime : Math.max(0, this.coyote - dt);
    this.buffer = input.jumpPressed ? p.jumpBufferTime : Math.max(0, this.buffer - dt);

    let jumped = false;
    if (this.buffer > 0 && this.coyote > 0) {
      vy = -p.jumpVelocity;
      this.buffer = 0;
      this.coyote = 0;
      this.canCut = true;
      jumped = true;
    } else if (this.canCut) {
      if (vy >= 0) {
        this.canCut = false;
      } else if (!input.jumpHeld) {
        vy *= p.jumpCutMultiplier;
        this.canCut = false;
      }
    }

    const moveX = Math.max(-1, Math.min(1, input.moveX));
    return {
      vx: moveX * p.runSpeed * this.speedMultiplier,
      vy: Math.min(vy, p.maxFallSpeed),
      jumped,
    };
  }
}
