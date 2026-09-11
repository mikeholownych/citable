import { nowIso } from '../../shared/io.js';

export class CorrelationTracker {
  constructor() {
    this._sequence = 0;
    this._startTime = performance.now();
    this._currentStep = null; // { step_id, step_sequence, checkpoint_id }
    this._phase = 'initial'; // 'initial' | 'during_step' | 'between_steps' | 'post_journey'
  }

  nextSequence() {
    this._sequence += 1;
    return this._sequence;
  }

  timing() {
    const elapsed = Math.round((performance.now() - this._startTime) * 100) / 100;
    return {
      monotonic_offset_ms: elapsed,
      timestamp: nowIso(),
    };
  }

  startStep(step, stepSequence) {
    this._currentStep = {
      step_id: step.step_id,
      step_sequence: stepSequence,
      checkpoint_id: step.checkpoint_id || null,
    };
    this._phase = 'during_step';
  }

  endStep(step, stepSequence) {
    this._phase = 'between_steps';
  }

  finishJourney() {
    this._phase = 'post_journey';
  }

  /**
   * Get correlation context for a newly initiated event/request.
   */
  getCorrelation(checkpointId = null) {
    const stepId = this._currentStep ? this._currentStep.step_id : null;
    return {
      step_id: stepId,
      step_sequence: this._currentStep ? this._currentStep.step_sequence : null,
      checkpoint_id: checkpointId || (this._currentStep ? this._currentStep.checkpoint_id : null),
      attribution_phase: this._phase,
      initiated_step_id: stepId,
      completed_step_id: null,
      ambiguous_async: false,
    };
  }

  /**
   * Correlate completion of an asynchronous transaction (e.g. HTTP response).
   * If the initiating step differs from the completing step/phase, mark as ambiguous_async.
   */
  correlateCompletion(initiatedCorrelation) {
    const currentCorrelation = this.getCorrelation();
    const isSameStep = initiatedCorrelation.step_id === currentCorrelation.step_id;
    const isSamePhase = initiatedCorrelation.attribution_phase === currentCorrelation.attribution_phase;

    let phase = initiatedCorrelation.attribution_phase;
    let ambiguousAsync = false;
    if (!isSameStep || (!isSamePhase && currentCorrelation.attribution_phase !== 'during_step')) {
      phase = 'ambiguous_async';
      ambiguousAsync = true;
    }

    return {
      step_id: initiatedCorrelation.step_id,
      step_sequence: initiatedCorrelation.step_sequence,
      checkpoint_id: initiatedCorrelation.checkpoint_id,
      attribution_phase: phase,
      initiated_step_id: initiatedCorrelation.step_id,
      completed_step_id: currentCorrelation.step_id,
      ambiguous_async: ambiguousAsync,
    };
  }
}
