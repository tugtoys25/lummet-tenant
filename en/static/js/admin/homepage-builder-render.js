// ------------------------------------------------------------
// Render builder
// ------------------------------------------------------------

function renderHomepageSections() {

  const container =
    document.getElementById(
      "homepageSections"
    );

  if (!container) return;

  container.innerHTML = "";

  homepageSections.forEach(
    (section, sectionIndex) => {

      const wrapper = renderHomepageSectionShell(section, sectionIndex);

      renderHomepageParagraphs(wrapper, section);
      renderHomepageCards(wrapper, section);
      bindHomepageSectionControls(wrapper, section, sectionIndex);

      container.appendChild(wrapper);
    }
  );
}
