function collectHomepageSections() {

  const containers =
    document.querySelectorAll(
      "#homepageSections .homepage-admin-section"
    );

  return Array.from(containers)
    .map((wrapper, sectionIndex) => {

      const original =
        homepageSections[sectionIndex] ||
        createHomepageSection(
          "features"
        );

      const paragraphs =
        Array.from(
          wrapper.querySelectorAll(
            ".paragraph-input"
          )
        )
        .map(input =>
          input.value.trim()
        )
        .filter(Boolean);


      const cards =
        Array.from(
          wrapper.querySelectorAll(
            ".section-cards > div"
          )
        )
        .map(cardElement => ({

          id:
            homepageId("card"),

          enabled:
            cardElement.querySelector(
              ".card-enabled"
            )?.checked !== false,

          title:
            cardElement.querySelector(
              ".card-title"
            )?.value.trim() || "",

          text:
            cardElement.querySelector(
              ".card-text"
            )?.value.trim() || "",

          iconType:
            cardElement.querySelector(
              ".card-icon-type"
            )?.value || "icon",

          icon:
            cardElement.querySelector(
              ".card-icon"
            )?.value || "",

          imageUrl:
            cardElement.querySelector(
              ".card-image-url"
            )?.value.trim() || "",

          url:
            cardElement.querySelector(
              ".card-url"
            )?.value.trim() || "",

          target:
            cardElement.querySelector(
              ".card-target"
            )?.value === "_blank"
              ? "_blank"
              : "_self",

          backgroundColor:
            cardElement.querySelector(
              ".card-background-color"
            )?.value.trim() || "",

          backgroundImage:
            cardElement.querySelector(
              ".card-background-image"
            )?.value.trim() || "",

          textColor:
            cardElement.querySelector(
              ".card-text-color"
            )?.value.trim() || "",

          iconColor:
            cardElement.querySelector(
              ".card-icon-color"
            )?.value.trim() || ""
        }));


      return {

        id:
          original.id ||
          homepageId("section"),

        enabled:
          wrapper.querySelector(
            ".section-enabled"
          )?.checked !== false,

        type:
          wrapper.querySelector(
            ".section-type"
          )?.value || "features",

        title:
          wrapper.querySelector(
            ".section-title"
          )?.value.trim() || "",

        subtitle:
          wrapper.querySelector(
            ".section-subtitle"
          )?.value.trim() || "",

        description:
          wrapper.querySelector(
            ".section-description"
          )?.value.trim() || "",

        alignment:
          wrapper.querySelector(
            ".section-alignment"
          )?.value || "center",

        backgroundColor:
          wrapper.querySelector(
            ".section-background-color"
          )?.value.trim() || "",

        backgroundImage:
          wrapper.querySelector(
            ".section-background-image"
          )?.value.trim() || "",

        textColor:
          wrapper.querySelector(
            ".section-text-color"
          )?.value.trim() || "",

        cards,

        paragraphs,

        buttonText:
          wrapper.querySelector(
            ".section-button-text"
          )?.value.trim() || "",

        buttonUrl:
          wrapper.querySelector(
            ".section-button-url"
          )?.value.trim() || "",

        buttonStyle:
          wrapper.querySelector(
            ".section-button-style"
          )?.value || "primary"
      };
    });
}


