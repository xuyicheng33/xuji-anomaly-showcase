import type { Journey } from '../journey';
import { availableMethods } from '../resultCatalog';
import { FormulaLine } from './MathText';
import { figures, moduleText, type Architecture, type ModuleId } from './modelArchitecture';
import { modelName } from './modelNames';

/** The report's text for every module of the model page, in the order of its figure. */
export default function ModelComponentNotes({ data }: { data: Journey }) {
  const context = { window: data.window, features: data.features.length };
  return (
    <>
      {availableMethods(data).map((method) => {
        const architecture: Architecture = method.id === 'model2' ? 'smst' : 'stam';
        const figure = figures[architecture];
        const modules = [...figure.nodes, figure.end]
          .map((node) => node.module)
          .filter((module, i, all): module is ModuleId => all.indexOf(module) === i);
        return (
          <section key={method.id} className="model-component-notes">
            <h3>
              {modelName(method)}
              <span>
                报告{figure.number}　{figure.caption}
              </span>
            </h3>
            <dl>
              {modules.map((module) => {
                const text = moduleText(module, architecture, context);
                return (
                  <div key={module}>
                    <dt>{text.title}</dt>
                    <dd>
                      {text.paragraphs.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                      {text.formulas?.map((formula, i) => (
                        <FormulaLine key={i} formula={formula} />
                      ))}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}
    </>
  );
}
