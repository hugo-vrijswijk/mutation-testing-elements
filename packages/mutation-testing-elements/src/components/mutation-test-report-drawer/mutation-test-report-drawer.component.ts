import { customElement, html, LitElement, property, unsafeCSS } from 'lit-element';
import { renderIf } from '../../lib/htmlHelpers';
import { bootstrap } from '../../style';
import style from './mutation-test-report-drawer.component.scss';

export type DrawerMode = 'open' | 'half' | 'closed';

@customElement('mutation-test-report-drawer')
export class MutationTestReportDrawer extends LitElement {
  public static styles = [bootstrap, unsafeCSS(style)];

  @property({ reflect: true })
  public mode: DrawerMode = 'closed';

  @property({ reflect: true, type: Boolean })
  public hasDetail = false;

  @property()
  public get toggleMoreLabel() {
    switch (this.mode) {
      case 'half':
        return '🔼 More';
      case 'open':
        return '🔽 Less';
      case 'closed':
        return '';
    }
  }

  public toggleReadMore = (event: MouseEvent) => {
    if (this.mode === 'open') {
      this.mode = 'half';
    } else {
      this.mode = 'open';
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  render() {
    return html`<aside class="container-fluid" @click="${(event: Event) => event.stopPropagation()}">
      <div class="row">
        <header>
          <h5>
            <slot name="header"></slot>
            ${renderIf(
              this.hasDetail,
              html`<button data-testId="btnReadMoreToggle" class="btn" @click="${this.toggleReadMore}">${this.toggleMoreLabel}</button>`
            )}
          </h5>
        </header>
        <div class="col-md-12">
          <slot name="summary"></slot>
          ${renderIf(this.hasDetail && this.mode === 'open', html`<slot name="detail"></slot>`)}
        </div>
      </div>
    </aside>`;
  }
}
