// "Add" buttons of the site settings form: compliance row and homepage sections (called by initSettingsForm).

function initSettingsSectionButtons() {
  const addButton =
    document.getElementById(
      "addComplianceBtn"
    );

  if (addButton) {

    addButton.addEventListener(
      "click",
      addComplianceRow
    );

  }

  const addFeaturesSectionButton =
  document.getElementById(
    "addFeaturesSectionBtn"
  );

if (addFeaturesSectionButton) {
  addFeaturesSectionButton.addEventListener(
    "click",
    () => {

      homepageSections.push(
        createHomepageSection(
          "features"
        )
      );

      renderHomepageSections();
    }
  );
}


const addTextSectionButton =
  document.getElementById(
    "addTextSectionBtn"
  );

if (addTextSectionButton) {
  addTextSectionButton.addEventListener(
    "click",
    () => {

      homepageSections.push(
        createHomepageSection(
          "text"
        )
      );

      renderHomepageSections();
    }
  );
}


const addCardsSectionButton =
  document.getElementById(
    "addCardsSectionBtn"
  );

if (addCardsSectionButton) {
  addCardsSectionButton.addEventListener(
    "click",
    () => {

      homepageSections.push(
        createHomepageSection(
          "cards"
        )
      );

      renderHomepageSections();
    }
  );
}
}
