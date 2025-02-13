import { html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { MetricsResult, TestFileModel, TestMetrics, TestModel } from 'mutation-testing-metrics';
import { MteCustomEvent } from '../../lib/custom-events';
import { bootstrap } from '../../style';
import { DrawerMode } from '../drawer/drawer.component';
import { Column } from '../metrics-table/metrics-table.component';
import style from './test-view.scss';

@customElement('mte-test-view')
export class MutationTestReportTestViewComponent extends LitElement {
  @property()
  public drawerMode: DrawerMode = 'closed';

  @property()
  public result!: MetricsResult<TestFileModel, TestMetrics>;

  @property({ attribute: false, reflect: false })
  public path!: string[];

  @property()
  private selectedTest?: TestModel;

  public static styles = [bootstrap, unsafeCSS(style)];

  private handleClick = () => {
    // Close the drawer if the user clicks anywhere in the report (that didn't handle the click already)
    this.drawerMode = 'closed';
  };

  private handleTestSelected = (event: MteCustomEvent<'test-selected'>) => {
    this.selectedTest = event.detail.test;
    this.drawerMode = event.detail.selected ? 'half' : 'closed';
  };

  public updated(changes: PropertyValues) {
    if (changes.has('result') && !this.result.file) {
      this.drawerMode = 'closed';
    }
  }

  public render() {
    return html`
      <main @click="${this.handleClick}">
        <div class="row">
          <div class="totals col-sm-11">
            <mte-metrics-table .columns="${COLUMNS}" .currentPath="${this.path}" .model="${this.result}"> </mte-metrics-table>
          </div>
        </div>
        ${this.result.file ? html`<mte-test-file @test-selected="${this.handleTestSelected}" .model="${this.result.file}"></mte-test-file>` : ''}
      </main>
      <mte-drawer-test .mode="${this.drawerMode}" .test="${this.selectedTest}"></mte-drawer-test>
    `;
  }
}

const COLUMNS: Column<TestMetrics>[] = [
  { key: 'killing', label: '# Killing', tooltip: 'These tests killed at least one mutant', width: 'normal', category: 'number' },
  {
    key: 'covering',
    label: '# Covering',
    tooltip: 'These tests are covering at least one mutant, but not killing any of them.',
    width: 'normal',
    category: 'number',
  },
  {
    key: 'notCovering',
    label: '# Not Covering',
    tooltip: 'These tests were not covering a mutant (and thus not killing any of them).',
    width: 'normal',
    category: 'number',
  },
  { key: 'total', label: 'Total tests', width: 'large', category: 'number', isBold: true },
];
