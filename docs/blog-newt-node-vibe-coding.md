# Blog Draft: Image-First Newt_Node Post

Suggested title:

Vibe Coding Newt_Node: Replacing Krea and Flaura With My Own Creative Node System

Suggested labels:

Newt_Node, AI tools, vibe coding, generative AI, creative workflow, node editor

## Visual Direction

Use screenshots and generated output images as the main storytelling layer. Do not show raw workflow JSON or code in the post. Instead, open the saved workflow files in Newt_Node and screenshot the canvas so the JSONs are represented visually as node graphs.

The strongest version of this post should feel like a guided studio tour:

- Full canvas screenshots to show the complete workflow language.
- Node closeups to show how text, image, video, utility, Composer, Preview, and 3D nodes behave.
- Output examples to prove the workflows are producing usable media.
- Stats screenshots to show that cost tracking is part of the creative process.
- Short captions under every image so readers can understand the workflow without reading raw configuration.

## Image Set To Capture

1. Hero canvas
   Open a visually rich workflow such as `Storyboard-Builder_v01.json`, `Invasion.json`, or `MarkHead.json`.
   Capture the full Newt_Node canvas with several connected nodes visible.
   Caption: A Newt_Node canvas turns prompts, references, masks, previews, and generations into a reusable creative graph.

2. Composer workflow
   Open a workflow with the Composer node connected into an Image Model node.
   Capture the Composer node, its frame output, and the Image Model receiving that frame.
   Caption: The Composer node blocks camera, pose, scale, primitives, and image planes before generation.

3. 3D node workflow
   Open `image-to-3d_template.json`.
   Capture the Image node connected to the 3D node and the Preview node.
   Caption: The new 3D node sends named image views into Hunyuan 3D and previews the generated GLB inside Newt_Node.

4. 3D output example
   Use the generated Hunyuan 3D thumbnail in `C:\dev\Newt_Node\outputs`.
   Caption: A generated 3D asset becomes part of the local project instead of being trapped on a provider page.

5. Utility video workflow
   Open a workflow such as `Zootopia.json` or a saved utility test.
   Capture Video input into Utility nodes such as SAM, VOID, BiRefNet, RIFE, or upscaling.
   Caption: Utility nodes make cleanup, matting, interpolation, upscaling, and extraction part of the same graph.

6. Preview node gallery
   Capture a Preview node with multiple results and the next/previous controls visible.
   Caption: Preview nodes keep generations available so results can be compared instead of overwritten.

7. Stats tab
   Capture the Generation Stats view with model spend, project names, and media mix visible.
   Caption: Cost tracking is treated as part of the workflow, not an afterthought.

8. Workflow gallery
   Load several saved workflow JSONs and capture one thumbnail-style screenshot for each.
   Suggested saved workflows: `Storyboard-Builder_v01.json`, `CharaterBuilder_v01.json`, `lab_v04.json`, `image-to-3d_template.json`, `Zootopia.json`.
   Caption: Saved workflows are local project files, but in the post they should be shown as visual node systems.

## Copy-Ready Post

Over the last stretch of development, I have been vibe coding a new creative tool called **Newt_Node**.

That phrase, vibe coding, gets thrown around a lot right now, but in this case it is exactly what the process felt like. I was not writing a formal spec from the top down. I was working from friction. I would hit something annoying in the creative workflow, describe what I wanted the tool to feel like, test it, react to it, and then keep shaping it.

The app evolved through conversation, screenshots, broken runs, UI instincts, and a lot of small decisions that slowly turned into a real system.

[IMAGE 01: Full Newt_Node canvas hero]

Newt_Node started as a local node-based workflow for image and video generation. It has now become the center of how I am doing AI visual development. At this point, it has effectively replaced my use of Krea and Flaura for this kind of work.

Not because those tools are bad. They are polished, capable, and useful. But they are also someone else's workflow.

Newt_Node is becoming mine.

## Why Replace Krea And Flaura?

The biggest shift is control.

In hosted creative tools, I am usually working inside a beautifully designed box. That can be great when the box matches what I want to do. But when I want to build a repeatable workflow, inspect costs, reuse intermediate outputs, route prompts through different processors, connect images into video models, or keep a local project structure, I start wanting something more modular.

Newt_Node gives me a graph instead of a single prompt box.

[IMAGE 02: A saved workflow JSON loaded as a visible canvas graph]

The graph matters because creative AI work is rarely just one prompt anymore. It is a text idea, a prompt processor, a reference image, a style reference, a composition guide, a video source, a mask, a utility pass, a preview, a generation, and another generation based on the first result.

When those pieces are nodes, I can see the thinking. I can reuse it. I can branch it. I can debug it.

That is the part that changed the workflow for me.

## Building The Tool While Using The Tool

The funny thing about Newt_Node is that it was built in the same spirit that it supports.

I would use the app, find the next missing behavior, and then add it. The canvas needed to pan with a regular mouse, not just a touchpad. The canvas needed to resize with the browser window. Save and Open needed to preserve projects. Previews needed to hold onto multiple generations. Stats needed to show real cost estimates, because guessing at spend is a terrible way to use paid generation APIs.

Each improvement came from a real moment of use.

[IMAGE 03: Node closeups showing Text, Image Model, Utility, Preview, Composer, and 3D]

The app grew node by node: Text nodes for prompt processing, Image Model nodes for generation, Video Model nodes for motion, Utility nodes for cleanup and transformation, Preview nodes for comparing outputs, Groups for organizing workflows, Composer for shot blocking, and now a dedicated 3D node for asset generation.

That last one is especially interesting because it starts to pull Newt_Node beyond image and video prompting and into asset creation.

## The Composer Node

One of the more important additions has been the Composer node.

The idea is simple: I want a lightweight way to block a shot before I ask an image model to generate it. Not a full 3D package. Not Blender. Just a fast composition space with a camera, human maquettes, primitives, image planes, and a frame output.

[IMAGE 04: Composer node frame output connected into an Image Model node]

That frame can then be connected into an image model as a composition guide.

This matters because image models are strong at style and detail, but they do not always respect layout unless the instruction is very clear. A rough 3D frame gives the model a visual anchor. The better the maquette and camera framing, the easier it is to push composition instead of just hoping the prompt lands.

The Composer node is not trying to be final art. It is trying to be visual intent.

## The New 3D Node

The latest addition is a dedicated **3D** node using Hunyuan 3D through Fal.

[IMAGE 05: Image-to-3D workflow canvas]

The node takes named image inputs such as Front, Back, Left, Right, Top, Bottom, Left Front, and Right Front. Front is required. The rest are optional. The important part is that the graph preserves the meaning of each view instead of guessing based on connection order.

When the model runs, Newt_Node downloads the generated GLB locally, stores it in the outputs folder, previews it inside the node with a Three.js viewer, and provides a download button directly on the result.

[IMAGE 06: Generated 3D output thumbnail]

That may sound like a small thing, but it changes the feel of the workflow. The result is not trapped in a provider page. It is part of the project graph. It can be previewed, saved, downloaded, and used as a step in a larger creative process.

## Utility Nodes And Video Workflows

Another area where Newt_Node has grown quickly is the Utility node.

Video cleanup is rarely one model and done. A shot might need a mask, a matte, interpolation, upscaling, frame extraction, or inpainting. Having those operations live in the same canvas as the creative generation nodes makes the work easier to understand and repeat.

[IMAGE 07: Utility video workflow]

The important part is that every pass stays visible. I can see what source video went into the node, what model was used, where the mask came from, and where the result went next.

That visual continuity is one of the reasons I keep reaching for Newt_Node first.

## Cost Tracking Became A Feature, Not An Afterthought

When working with paid APIs, the cost of experimentation can creep up quickly. One of the lessons from building this tool is that creative flow and financial visibility need to exist together.

If a model run costs money, the app should try to show that cost honestly.

[IMAGE 08: Generation Stats tab]

So Newt_Node tracks generation history, media type, model, project, settings, and estimated spend. For some models, the estimate is straightforward. For others, it depends on resolution, duration, frames, add-ons, or whether the provider returns usage metadata.

The rule I want in the app is simple: if we can estimate it, estimate it. If we cannot, mark it as unpriced. Do not pretend it is free.

That decision came directly from use. It is easy to get caught up in generation loops. It is much better to know what the loop is costing.

## Why This Feels Different

The reason Newt_Node has started replacing Krea and Flaura for me is not just that it can call similar models. It is that it reflects the way I actually want to work.

I want to connect ideas visually, keep prompts and outputs together, use images, video, text, masks, and 3D as equal citizens, build workflows that can be saved and reopened, see which models are active, inspect and reuse generations, understand cost, and add new model types without redesigning the whole app.

[IMAGE 09: Workflow gallery made from saved JSON projects]

That is the real win.

Newt_Node is not just a wrapper around generation APIs. It is becoming a personal creative operating system for AI media work.

## Vibe Coding As A Collaboration

The development process itself has been a collaboration between instinct and implementation.

I would say things like: this node feels too cluttered, the dots should move when Settings opens, the preview should not clear after a new generation, I need to delete selected connection lines, I want grouped nodes to move together, I need the video preview to loop, I want Run All to play selected preview videos, I want the 3D input dots broken out by view.

Those are not abstract feature tickets. They are creative workflow observations.

The app got better because the feedback was grounded in actual use. Screenshot by screenshot, run by run, annoyance by annoyance.

That is the part of vibe coding I actually like. It is not about being careless. It is about staying close to the experience of the tool while building it.

## Where It Goes Next

The next step is production.

These tools are not just interesting experiments anymore. They are going to be used to create imagery and video in ways, and at speeds, that were impossible before. The important part is not only that the machine can generate more. It is that I can bring 20+ years of creative direction to the process and curate the slop into something intentional.

That is where this starts to feel empowering.

Newt_Node gives me a way to control media instead of just prompting and hoping. I can build a workflow, steer the references, shape the composition, review the outputs, track the cost, and keep the whole process inside a sandbox that is tuned to how I actually think.

I am already cooking up partnerships for media creation, and I can see how this will blow commercial clients away with visuals that move faster from idea to execution than the old pipeline could allow.

Yes, a lot of this is possible with third-party apps. Krea and Flaura are still out there, and they are still powerful. But there is something incredible about having a bespoke sandbox where I can roll my own.

That is what Newt_Node is becoming: not just another AI interface, but a production environment for making the work sharper, faster, stranger, and more mine.

## Upload Checklist

- Replace each `[IMAGE]` marker with the matching Blogger-uploaded image.
- Keep captions short and practical.
- Prefer real UI screenshots over decorative images.
- Show workflow JSONs as loaded canvas screenshots, not raw JSON.
- Use the generated output images as proof points between workflow screenshots.
- Avoid code blocks in the final Blogger post.
