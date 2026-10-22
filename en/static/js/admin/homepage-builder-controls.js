// Homepage builder: section buttons (move, duplicate, delete ...)
// Classic script; shares the global scope with the other homepage-builder-*.js files (load order is in templates/layout/base.html).

function bindHomepageSectionControls(wrapper, section, sectionIndex) {
  // ------------------------------------------------------
  // Section controls
  // ------------------------------------------------------

  wrapper
    .querySelector(
      ".remove-section"
    )
    .addEventListener(
      "click",
      () => {

        homepageSections
          .splice(
            sectionIndex,
            1
          );

        renderHomepageSections();
      }
    );


  wrapper
    .querySelector(
      ".duplicate-section"
    )
    .addEventListener(
      "click",
      () => {

        const copy =
          JSON.parse(
            JSON.stringify(section)
          );

        copy.id =
          homepageId("section");

        homepageSections
          .splice(
            sectionIndex + 1,
            0,
            copy
          );

        renderHomepageSections();
      }
    );


  wrapper
    .querySelector(
      ".move-up"
    )
    .addEventListener(
      "click",
      () => {

        if (sectionIndex === 0)
          return;

        [
          homepageSections[
            sectionIndex - 1
          ],
          homepageSections[
            sectionIndex
          ]
        ] = [
          homepageSections[
            sectionIndex
          ],
          homepageSections[
            sectionIndex - 1
          ]
        ];

        renderHomepageSections();
      }
    );


  wrapper
    .querySelector(
      ".move-down"
    )
    .addEventListener(
      "click",
      () => {

        if (
          sectionIndex >=
          homepageSections.length - 1
        ) return;

        [
          homepageSections[
            sectionIndex + 1
          ],
          homepageSections[
            sectionIndex
          ]
        ] = [
          homepageSections[
            sectionIndex
          ],
          homepageSections[
            sectionIndex + 1
          ]
        ];

        renderHomepageSections();
      }
    );


  wrapper
    .querySelector(
      ".add-paragraph"
    )
    .addEventListener(
      "click",
      () => {

        section.paragraphs =
          section.paragraphs || [];

        section.paragraphs.push(
          "New paragraph..."
        );

        renderHomepageSections();
      }
    );


  wrapper
    .querySelector(
      ".add-card"
    )
    .addEventListener(
      "click",
      () => {

        section.cards =
          section.cards || [];

        section.cards.push(
          createHomepageCard()
        );

        renderHomepageSections();
      }
    );
}
