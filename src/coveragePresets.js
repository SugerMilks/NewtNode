export const coverageMethods = ["Standard", "Dynamic", "Insane"];

const baseInstruction =
  "Use the provided image as the base image. Keep the same subject matter, the same exact subject or subjects with the same pose, same eyeline, same location, same lighting, and same color grade. Change only the camera angle.";

export const coveragePresets = {
  Standard: [
    {
      label: "Worm's Eye View",
      direction:
        "Re-render the scene to a true Warm's Eye View: a wide-angle lens with the camera positioned low, pointing up from the ground, so we look up at the subject. Standard film blocking technique."
    },
    {
      label: "Bird's Eye View",
      direction:
        "Re-render the scene to a Bird's Eye View: a high-angle shot with a 35mm lens. Standard film blocking technique."
    },
    {
      label: "Three-Quarter Medium Shot",
      direction:
        "Re-render the scene to a three-quarter-view medium shot with a 50mm lens and shallow depth of field. Standard film blocking technique."
    },
    {
      label: "Macro Extreme Close-Up",
      direction:
        "Re-render the scene to a macro extreme close-up, shot on a macro probe lens. Standard film blocking technique."
    },
    {
      label: "Wide Full Shot",
      direction:
        "Re-render the scene to a wide full shot with a 35mm lens at eye level. Standard film blocking technique."
    },
    {
      label: "Three-Quarter Portrait Close-Up",
      direction:
        "Re-render the scene to a close-up portrait at a slight three-quarter angle with the eyeline off camera, using a 50mm lens at eye level. Standard film blocking technique."
    },
    {
      label: "Profile Close-Up",
      direction:
        "Re-render the scene to a profile close-up with a 50mm lens at eye level. Standard film blocking technique."
    },
    {
      label: "Medium Wide Shot",
      direction:
        "Re-render the scene to a medium wide shot with a 50mm lens at eye level. Standard film blocking technique."
    },
    {
      label: "Extreme Close-Up",
      direction:
        "Re-render the scene to an extreme close-up with an 85mm lens at eye level. Standard film blocking technique."
    }
  ],
  Dynamic: [
    {
      label: "Dynamic Worm's Eye View",
      direction:
        "Re-render the scene to a true Worm's Eye View: a wide-angle lens with the camera positioned directly below the subject, pointing up from the ground, so we look directly up at the subject in a heroic stance. Create a new dynamic composition."
    },
    {
      label: "True Bird's Eye View",
      direction:
        "Re-render the scene to a true Bird's Eye View: the camera positioned directly above the subject, pointing straight down, so we look directly down onto the top of the subject and the floor fills most of the frame. The subject is seen from directly overhead, foreshortened on the ground below."
    },
    {
      label: "Low-Angle Three-Quarter Medium Shot",
      direction:
        "Re-render the scene to a low-angle three-quarter-view medium shot with a 35mm lens, dynamic framing, and shallow depth of field."
    },
    {
      label: "Dynamic Macro Extreme Close-Up",
      direction:
        "Re-render the scene to a macro extreme close-up with dynamic framing, shot on a macro probe lens. Extremely close, with very shallow depth of field and extremely detailed textures."
    },
    {
      label: "Dynamic Wide Full Shot",
      direction:
        "Re-render the scene to a wide full shot with an 18mm lens and dynamic framing."
    },
    {
      label: "Wide-Angle Portrait Close-Up",
      direction:
        "Re-render the scene to a close-up portrait at a slight three-quarter angle with the eyeline off camera, using a wide 24mm lens, dynamic framing, and shallow depth of field."
    },
    {
      label: "Dynamic Profile Medium Shot",
      direction:
        "Re-render the scene to a profile medium shot with a 50mm lens, dynamic framing, and shallow depth of field."
    },
    {
      label: "Dutch-Angle High Shot",
      direction:
        "Re-render the scene to a slightly Dutch-angled high shot with an 18mm lens and dynamic framing."
    },
    {
      label: "Low-Angle 180-Degree Back View",
      direction:
        "Re-render the scene to a 180-degree back view with a 35mm lens and dynamic low-angle framing."
    }
  ],
  Insane: [
    {
      label: "Extreme Dutch Worm's Eye View",
      direction:
        "Re-render the scene to a true Worm's Eye View: a very wide-angle lens with the camera positioned directly below the subject, pointing up from the ground, so we look directly up at the subject in a heroic stance. Create a new dynamic composition with a Dutch angle and an extremely wide-angle lens. Drastically break the norms. Not typical framing. Not standard framing. Not stock."
    },
    {
      label: "Distorted Bird's Eye View",
      direction:
        "Re-render the scene to a true Bird's Eye View: the camera positioned directly above the subject, pointing straight down, so we look directly down onto the top of the subject and the floor fills most of the frame. The subject is seen from directly overhead, foreshortened on the ground below. Place the crazy wide-angle camera extremely far from the subject, with a slight Dutch angle and strong lens distortion. Drastically break the norms. Not typical framing. Not standard framing. Not stock."
    },
    {
      label: "Fisheye Low-Angle Three-Quarter Shot",
      direction:
        "Re-render the scene to a low-angle three-quarter-view medium shot with an 8mm fisheye lens, dynamic framing, and very shallow depth of field. Give it a music-video composition."
    },
    {
      label: "Abstract Macro Extreme Close-Up",
      direction:
        "Re-render the scene to a macro extreme close-up with dynamic framing, shot on a macro probe lens. Extremely close, with very shallow depth of field and extremely detailed textures. Make the view angle extremely abstract and intense. Drastically break the norms. Not typical framing. Not standard framing. Not stock."
    },
    {
      label: "Fisheye Wide Full Shot",
      direction:
        "Re-render the scene to a wide full shot with a 12mm fisheye lens and dynamic framing. Use a slight Dutch angle and strong lens distortion. Drastically break the norms. Not typical framing. Not standard framing. Not stock."
    },
    {
      label: "Distorted Wide-Angle Portrait",
      direction:
        "Re-render the scene to a close-up portrait at a slight three-quarter angle with the eyeline off camera, using a slightly fisheye 18mm lens, dynamic framing, and shallow depth of field. Use a lower camera view, lens distortion, and a slight Dutch angle. Drastically break the norms. Not typical framing. Not standard framing. Not stock."
    },
    {
      label: "Long-Lens Off-Center Profile",
      direction:
        "Re-render the scene to a profile medium shot with a 100mm zoom lens, dynamic off-center framing, and extremely shallow depth of field. Drastically break the norms. Not typical framing. Not standard framing. Not stock."
    },
    {
      label: "Dutch-Angle High Macro Extreme Close-Up",
      direction:
        "Re-render the scene to a Dutch-angled high macro extreme close-up shot with dynamic off-center framing, shot on a macro probe lens. Extremely close, with very shallow depth of field and extremely detailed textures. Make the view angle extremely abstract and intense. Drastically break the norms. Not typical framing. Not standard framing. Not stock."
    },
    {
      label: "Off-Center High Back View",
      direction:
        "Re-render the scene to a 180-degree back view with an 18mm lens and dynamic, off-center, high-angle framing. Drastically break the norms. Not typical framing. Not standard framing. Not stock."
    }
  ]
};

export function normalizeCoverageMethod(value) {
  return coverageMethods.includes(value) ? value : coverageMethods[0];
}

export function coverageShotsForMethod(value) {
  const method = normalizeCoverageMethod(value);
  return coveragePresets[method].map((shot, index) => ({
    ...shot,
    id: `${method.toLowerCase()}-${index + 1}`,
    prompt: `${baseInstruction} ${shot.direction}`
  }));
}

export function coveragePreviewItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.url)
    .map((item) => ({ ...item, sourceUrl: item.url }));
}
