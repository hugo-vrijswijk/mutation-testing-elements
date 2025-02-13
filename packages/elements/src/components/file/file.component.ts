import { LitElement, html, unsafeCSS, PropertyValues, svg } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { createRef, ref } from 'lit/directives/ref.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { StateFilter } from '../state-filter/state-filter.component';
import { bootstrap, prismjs } from '../../style';
import { findDiffIndices, gte, highlightCode, transformHighlightedLines } from '../../lib/code-helpers';
import { MutantResult, MutantStatus } from 'mutation-testing-report-schema/api';
import style from './file.scss';
import { escapeHtml, getContextClassForStatus, getEmojiForStatus, scrollToCodeFragmentIfNeeded } from '../../lib/html-helpers';
import { FileUnderTestModel, MutantModel } from 'mutation-testing-metrics';
import { createCustomEvent, MteCustomEvent } from '../../lib/custom-events';

const diffOldClass = 'diff-old';
const diffNewClass = 'diff-new';
@customElement('mte-file')
export class FileComponent extends LitElement {
  @state()
  public filters: StateFilter<MutantStatus>[] = [];

  @property()
  public model!: FileUnderTestModel;

  @state()
  public selectedMutantStates: MutantStatus[] = [];

  @state()
  private selectedMutant?: MutantModel;

  @state()
  private lines: string[] = [];

  @state()
  public mutants: MutantModel[] = [];

  public static styles = [prismjs, bootstrap, unsafeCSS(style)];
  private codeRef = createRef<HTMLElement>();

  private readonly filtersChanged = (event: MteCustomEvent<'filters-changed'>) => {
    this.selectedMutantStates = event.detail as MutantStatus[];
  };

  private codeClicked = (ev: MouseEvent) => {
    ev.stopPropagation();

    if (ev.target instanceof Element) {
      let maybeMutantTarget: Element | null = ev.target;
      const mutantsInScope: MutantModel[] = [];
      for (; maybeMutantTarget instanceof Element; maybeMutantTarget = maybeMutantTarget.parentElement) {
        const mutantId = maybeMutantTarget.getAttribute('mutant-id');
        const mutant = this.mutants.find(({ id }) => id.toString() === mutantId);
        if (mutant) {
          mutantsInScope.push(mutant);
        }
      }
      const index = (this.selectedMutant ? mutantsInScope.indexOf(this.selectedMutant) : -1) + 1;
      if (mutantsInScope[index]) {
        this.toggleMutant(mutantsInScope[index]);
        clearSelection();
      } else if (this.selectedMutant) {
        this.toggleMutant(this.selectedMutant);
        clearSelection();
      }
    }
  };

  public render() {
    const mutantLineMap = new Map<number, MutantModel[]>();
    for (const mutant of this.mutants) {
      let mutants = mutantLineMap.get(mutant.location.start.line);
      if (!mutants) {
        mutants = [];
        mutantLineMap.set(mutant.location.start.line, mutants);
      }
      mutants.push(mutant);
    }
    const renderFinalMutants = (lastLine: number) => {
      return this.renderMutantDots([...mutantLineMap.entries()].filter(([line]) => line > lastLine).flatMap(([, mutants]) => mutants));
    };

    return html`
      <div class="row">
        <div class="col-md-12">
          <mte-state-filter
            allow-toggle-all
            .filters="${this.filters}"
            @filters-changed="${this.filtersChanged}"
            @next=${this.nextMutant}
            @previous=${this.previousMutant}
          ></mte-state-filter>
          <pre
            @click="${this.codeClicked}"
            id="report-code-block"
            class="line-numbers ${this.selectedMutantStates.map((state) => `mte-selected-${state}`).join(' ')}"
          ><code ${ref(this.codeRef)} class="language-${this.model.language}"><table>${this.lines.map((line, lineIndex) => {
            const lineNr = lineIndex + 1;
            return html`<tr class="line"
              ><td class="line-number"></td><td class="line-marker"></td
              ><td class="code"
                >${unsafeHTML(line)}${this.renderMutantDots(mutantLineMap.get(lineNr))}${this.lines.length === lineNr
                  ? renderFinalMutants(lineNr)
                  : ''}</td
              ></tr
            >`;
          })}</table></code></pre>
        </div>
      </div>
    `;
  }

  private nextMutant = () => {
    const index = this.selectedMutant ? (this.mutants.indexOf(this.selectedMutant) + 1) % this.mutants.length : 0;
    if (this.mutants[index]) {
      this.toggleMutant(this.mutants[index]);
    }
  };
  private previousMutant = () => {
    const index = this.selectedMutant
      ? (this.mutants.indexOf(this.selectedMutant) + this.mutants.length - 1) % this.mutants.length
      : this.mutants.length - 1;
    if (this.mutants[index]) {
      this.toggleMutant(this.mutants[index]);
    }
  };

  private renderMutantDots(mutants: MutantModel[] | undefined) {
    return html`${mutants?.map(
      (mutant) =>
        svg`<svg mutant-id="${mutant.id}" class="mutant-dot ${
          this.selectedMutant?.id === mutant.id ? 'selected' : mutant.status
        }" height="10" width="10">
          <title>${title(mutant)}</title>
          <circle cx="5" cy="5" r="5" />
          </svg>`
    )}`;
  }

  private toggleMutant(mutant: MutantModel) {
    this.removeCurrentDiff();
    if (this.selectedMutant === mutant) {
      this.selectedMutant = undefined;
      this.dispatchEvent(createCustomEvent('mutant-selected', { selected: false, mutant }));
      return;
    }

    this.selectedMutant = mutant;
    const lines = this.codeRef.value!.querySelectorAll('tr.line');
    for (let i = mutant.location.start.line - 1; i < mutant.location.end.line; i++) {
      lines.item(i).classList.add(diffOldClass);
    }
    const mutatedLines = this.highlightedReplacementRows(mutant);
    const mutantEndRow = lines.item(mutant.location.end.line - 1);
    mutantEndRow.insertAdjacentHTML('afterend', mutatedLines);
    scrollToCodeFragmentIfNeeded(mutantEndRow);
    this.dispatchEvent(createCustomEvent('mutant-selected', { selected: true, mutant }));
  }

  private removeCurrentDiff() {
    const oldDiffLines = this.codeRef.value!.querySelectorAll(`.${diffOldClass}`);
    oldDiffLines.forEach((oldDiffLine) => oldDiffLine.classList.remove(diffOldClass));
    const newDiffLines = this.codeRef.value!.querySelectorAll(`.${diffNewClass}`);
    newDiffLines.forEach((newDiffLine) => newDiffLine.remove());
  }

  public update(changes: PropertyValues<FileComponent>) {
    if (changes.has('model') && this.model) {
      this.filters = [
        MutantStatus.Killed,
        MutantStatus.Survived,
        MutantStatus.NoCoverage,
        MutantStatus.Ignored,
        MutantStatus.Timeout,
        MutantStatus.CompileError,
        MutantStatus.RuntimeError,
      ]
        .filter((status) => this.model.mutants.some((mutant) => mutant.status === status))
        .map((status) => ({
          enabled: [MutantStatus.Survived, MutantStatus.NoCoverage, MutantStatus.Timeout].includes(status),
          count: this.model.mutants.filter((m) => m.status === status).length,
          status,
          label: `${getEmojiForStatus(status)} ${status}`,
          context: getContextClassForStatus(status),
        }));
      const highlightedSource = highlightCode(this.model.source, this.model.name);
      const startedMutants = new Set<MutantResult>();
      const mutantsToPlace = new Set(this.model.mutants);

      this.lines = transformHighlightedLines(highlightedSource, function* (position) {
        // End previously opened mutants
        for (const mutant of startedMutants) {
          if (gte(position, mutant.location.end)) {
            startedMutants.delete(mutant);
            yield { elementName: 'span', id: mutant.id, isClosing: true };
          }
        }

        // Open new mutants
        for (const mutant of mutantsToPlace) {
          if (gte(position, mutant.location.start)) {
            startedMutants.add(mutant);
            mutantsToPlace.delete(mutant);
            yield {
              elementName: 'span',
              id: mutant.id,
              attributes: {
                class: escapeHtml(`mutant ${mutant.status}`),
                title: escapeHtml(title(mutant)),
                'mutant-id': escapeHtml(mutant.id),
              },
            };
          }
        }
      });
    }
    if ((changes.has('model') && this.model) || changes.has('selectedMutantStates')) {
      this.mutants = this.model.mutants
        .filter((mutant) => this.selectedMutantStates.includes(mutant.status))
        .sort((m1, m2) => (gte(m1.location.start, m2.location.start) ? 1 : -1));
      if (this.selectedMutant && !this.mutants.includes(this.selectedMutant)) {
        this.toggleMutant(this.selectedMutant);
      }
    }
    super.update(changes);
  }

  private highlightedReplacementRows(mutant: MutantModel): string {
    const mutatedLines = mutant.getMutatedLines().trimEnd();
    const originalLines = mutant.getOriginalLines().trimEnd();

    const [focusFrom, focusTo] = findDiffIndices(originalLines, mutatedLines);

    const lines = transformHighlightedLines(highlightCode(mutatedLines, this.model.name), function* ({ offset }) {
      if (offset === focusFrom) {
        yield { elementName: 'span', id: 'diff-focus', attributes: { class: 'diff-focus' } };
      } else if (offset === focusTo) {
        yield { elementName: 'span', id: 'diff-focus', isClosing: true };
      }
      return;
    });
    const lineStart = `<tr class="${diffNewClass}"><td class="empty-line-number"></td><td class="line-marker"></td><td class="code">`;
    const lineEnd = '</td></tr>';
    return lines.map((line) => `${lineStart}${line}${lineEnd}`).join('');
  }
}

function title(mutant: MutantModel): string {
  return `${mutant.mutatorName} ${mutant.status}`;
}

function clearSelection() {
  window.getSelection()?.removeAllRanges();
}
